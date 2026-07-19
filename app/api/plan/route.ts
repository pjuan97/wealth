import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'
import { VALID_PLAN_MONTHS, upsertPlanRow } from '@/lib/planService'

// Compute executed amounts from transactions
async function computeExecuted(monthLabel: string, userId: number) {
  const transactions = await prisma.transaction.findMany({
    where: {
      user_id: userId,
      month_label: monthLabel,
      event_type: { in: ['Income', 'Expense'] },
    },
    select: { level_2: true, level_3: true, amount: true, event_type: true },
  })

  // Group by level_2 + level_3
  const map = new Map<string, number>()
  for (const tx of transactions) {
    const key2 = tx.level_2 || ''
    const key3 = tx.level_3 || ''
    const keyFull = `${key2}||${key3}`
    map.set(keyFull, (map.get(keyFull) || 0) + Number(tx.amount))
    if (key3 !== '') {
      const key2Only = `${key2}||`
      map.set(key2Only, (map.get(key2Only) || 0) + Number(tx.amount))
    }
  }

  return map
}

// GET /api/plan?month=2026-01 -> monthly view
// GET /api/plan?view=annual   -> all months summary
export async function GET(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.id

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  const view = searchParams.get('view')

  try {
    if (view === 'annual') {
      const plans = await prisma.planVsAchievement.findMany({
        where: { user_id: userId },
        orderBy: [{ month_label: 'asc' }, { event_type: 'asc' }, { level_2: 'asc' }],
      })

      const months = [...new Set(plans.map(p => p.month_label))].sort()

      const executedByMonth = await Promise.all(
        months.map(async m => ({ month: m, map: await computeExecuted(m, userId) }))
      )
      const execMaps = Object.fromEntries(
        executedByMonth.map(({ month: m, map }) => [m, map])
      )

      const annualSummary = months.map(m => {
        const monthPlans = plans.filter(p => p.month_label === m)
        const execMap = execMaps[m] || new Map()

        const incomePlan = monthPlans
          .filter(p => p.event_type === 'Income')
          .reduce((s, p) => s + Number(p.plan), 0)

        const expensePlan = monthPlans
          .filter(p => p.event_type === 'Expense')
          .reduce((s, p) => s + Number(p.plan), 0)

        let incomeExec = 0
        let expenseExec = 0
        for (const plan of monthPlans) {
          const key = `${plan.level_2}||${plan.level_3 || ''}`
          const exec = execMap.get(key) || 0
          if (plan.event_type === 'Income') incomeExec += exec
          if (plan.event_type === 'Expense') expenseExec += exec
        }

        return {
          month: m,
          income_plan: incomePlan,
          income_exec: incomeExec,
          expense_plan: expensePlan,
          expense_exec: expenseExec,
          balance_plan: incomePlan - expensePlan,
          balance_exec: incomeExec - expenseExec,
          savings_rate_plan: incomePlan > 0 ? (incomePlan - expensePlan) / incomePlan : 0,
          savings_rate_exec: incomeExec > 0 ? (incomeExec - expenseExec) / incomeExec : 0,
        }
      })

      const categoryKeys = [...new Set(
        plans.map(p => `${p.event_type}||${p.level_2}||${p.level_3 || ''}`)
      )].sort()

      const categoryRows = categoryKeys.map(ck => {
        const [eventType, level_2, level_3] = ck.split('||')
        const monthData = months.map(m => {
          const plan = plans.find(p =>
            p.month_label === m &&
            p.event_type === eventType &&
            p.level_2 === level_2 &&
            (p.level_3 || '') === level_3
          )
          const execMap = execMaps[m] || new Map()
          const key = `${level_2}||${level_3}`
          const exec = execMap.get(key) || 0
          return {
            month: m,
            plan: plan ? Number(plan.plan) : 0,
            exec,
            diff: exec - (plan ? Number(plan.plan) : 0),
            achievement: plan && Number(plan.plan) > 0
              ? exec / Number(plan.plan)
              : null,
          }
        })
        return { eventType, level_2, level_3: level_3 || null, months: monthData }
      })

      return NextResponse.json({ annualSummary, categoryRows, months })
    }

    // Monthly view
    const targetMonth = month || '2026-04'
    const [plans, execMap] = await Promise.all([
      prisma.planVsAchievement.findMany({
        where: { user_id: userId, month_label: targetMonth },
        orderBy: [{ event_type: 'asc' }, { level_2: 'asc' }, { level_3: 'asc' }],
      }),
      computeExecuted(targetMonth, userId),
    ])

    const rows = plans.map(p => {
      const key = `${p.level_2}||${p.level_3 || ''}`
      const executed = execMap.get(key) || 0
      const plan = Number(p.plan)
      return {
        id: p.id,
        month_label: p.month_label,
        event_type: p.event_type,
        level_2: p.level_2,
        level_3: p.level_3,
        base: Number(p.base),
        inflation: Number(p.inflation),
        plan,
        executed,
        diff: executed - plan,
        achievement: plan > 0 ? executed / plan : null,
      }
    })

    const incomeRows = rows.filter(r => r.event_type === 'Income')
    const expenseRows = rows.filter(r => r.event_type === 'Expense')

    const totals = {
      income_plan: incomeRows.reduce((s, r) => s + r.plan, 0),
      income_exec: incomeRows.reduce((s, r) => s + r.executed, 0),
      expense_plan: expenseRows.reduce((s, r) => s + r.plan, 0),
      expense_exec: expenseRows.reduce((s, r) => s + r.executed, 0),
    }

    return NextResponse.json({ rows, totals, month: targetMonth })
  } catch (error) {
    console.error('GET /api/plan error:', error)
    return NextResponse.json({ error: 'Failed to fetch plan data' }, { status: 500 })
  }
}

// POST /api/plan - create/update plan rows for one category across selected months
export async function POST(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.id

  try {
    const body = await request.json()
    const { event_type, level_2, level_3, months, amount } = body

    if (!['Income', 'Expense'].includes(event_type)) {
      return NextResponse.json({ error: 'event_type must be Income or Expense' }, { status: 400 })
    }
    if (!level_2 || typeof level_2 !== 'string') {
      return NextResponse.json({ error: 'level_2 is required' }, { status: 400 })
    }
    if (!Array.isArray(months) || months.length === 0) {
      return NextResponse.json({ error: 'At least one month is required' }, { status: 400 })
    }
    const invalidMonths = months.filter((m: string) => !VALID_PLAN_MONTHS.includes(m))
    if (invalidMonths.length > 0) {
      return NextResponse.json({ error: `Invalid month(s): ${invalidMonths.join(', ')}` }, { status: 400 })
    }
    const amountNum = Number(amount)
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      return NextResponse.json({ error: 'amount must be a non-negative number' }, { status: 400 })
    }

    const level3Value: string | null = level_3 || null

    // Guard against mismatches: the category/subcategory must exist in Data Source.
    const catMatch = await prisma.categoryDef.findFirst({
      where: { user_id: userId, level_1: event_type, level_2, level_3: level3Value },
    })
    if (!catMatch) {
      return NextResponse.json({ error: 'This category/subcategory is not defined in Data Source' }, { status: 400 })
    }

    await Promise.all(
      months.map((m: string) => upsertPlanRow(userId, m, event_type, level_2, level3Value, amountNum))
    )

    return NextResponse.json({ success: true, count: months.length, months })
  } catch (error) {
    console.error('POST /api/plan error:', error)
    return NextResponse.json({ error: 'Failed to create plan item' }, { status: 500 })
  }
}

// PATCH /api/plan - update plan value for a row
export async function PATCH(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.id

  try {
    const body = await request.json()
    const { id, base, plan } = body

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    // Verify ownership
    const existing = await prisma.planVsAchievement.findFirst({ where: { id, user_id: userId } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const updated = await prisma.planVsAchievement.update({
      where: { id },
      data: {
        ...(base !== undefined && { base: parseFloat(base) }),
        ...(plan !== undefined && { plan: parseFloat(plan) }),
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/plan error:', error)
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 })
  }
}
