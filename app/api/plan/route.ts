import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'
import { VALID_PLAN_MONTHS, upsertPlanRow } from '@/lib/planService'

// Compute executed amounts from transactions, separately in COP and USD.
// A Plan row's `currency` decides which of the two maps it's compared against —
// this avoids FX-rate drift creating false variance for USD-denominated plans.
async function computeExecuted(monthLabel: string, userId: number) {
  const transactions = await prisma.transaction.findMany({
    where: {
      user_id: userId,
      month_label: monthLabel,
      event_type: { in: ['Income', 'Expense'] },
    },
    select: { level_2: true, level_3: true, amount: true, usd_amount: true, event_type: true },
  })

  const cop = new Map<string, number>()
  const usd = new Map<string, number>()

  const addTo = (map: Map<string, number>, key2: string, key3: string, value: number) => {
    if (value === 0) return
    const keyFull = `${key2}||${key3}`
    map.set(keyFull, (map.get(keyFull) || 0) + value)
    if (key3 !== '') {
      const key2Only = `${key2}||`
      map.set(key2Only, (map.get(key2Only) || 0) + value)
    }
  }

  for (const tx of transactions) {
    const key2 = tx.level_2 || ''
    const key3 = tx.level_3 || ''
    addTo(cop, key2, key3, Number(tx.amount))
    if (tx.usd_amount) addTo(usd, key2, key3, Number(tx.usd_amount))
  }

  return { cop, usd }
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
        const execMap = execMaps[m] || { cop: new Map(), usd: new Map() }

        const sumPlan = (eventType: string, currency: string) => monthPlans
          .filter(p => p.event_type === eventType && p.currency === currency)
          .reduce((s, p) => s + Number(p.plan), 0)

        const sumExec = (eventType: string, currency: string) => {
          const map = currency === 'USD' ? execMap.usd : execMap.cop
          let total = 0
          for (const plan of monthPlans) {
            if (plan.event_type !== eventType || plan.currency !== currency) continue
            const key = `${plan.level_2}||${plan.level_3 || ''}`
            total += map.get(key) || 0
          }
          return total
        }

        const build = (currency: string) => {
          const incomePlan = sumPlan('Income', currency)
          const expensePlan = sumPlan('Expense', currency)
          const incomeExec = sumExec('Income', currency)
          const expenseExec = sumExec('Expense', currency)
          return {
            income_plan: incomePlan,
            income_exec: incomeExec,
            expense_plan: expensePlan,
            expense_exec: expenseExec,
            balance_plan: incomePlan - expensePlan,
            balance_exec: incomeExec - expenseExec,
            savings_rate_plan: incomePlan > 0 ? (incomePlan - expensePlan) / incomePlan : 0,
            savings_rate_exec: incomeExec > 0 ? (incomeExec - expenseExec) / incomeExec : 0,
          }
        }

        return { month: m, COP: build('COP'), USD: build('USD') }
      })

      const categoryKeys = [...new Set(
        plans.map(p => `${p.event_type}||${p.level_2}||${p.level_3 || ''}`)
      )].sort()

      const categoryRows = categoryKeys.map(ck => {
        const [eventType, level_2, level_3] = ck.split('||')
        // A category's currency is assumed consistent across months; take it from any row that has it.
        const currency = plans.find(p =>
          p.event_type === eventType && p.level_2 === level_2 && (p.level_3 || '') === level_3
        )?.currency || 'COP'
        const monthData = months.map(m => {
          const plan = plans.find(p =>
            p.month_label === m &&
            p.event_type === eventType &&
            p.level_2 === level_2 &&
            (p.level_3 || '') === level_3
          )
          const execMap = execMaps[m] || { cop: new Map(), usd: new Map() }
          const map = currency === 'USD' ? execMap.usd : execMap.cop
          const key = `${level_2}||${level_3}`
          const exec = map.get(key) || 0
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
        return { eventType, level_2, level_3: level_3 || null, currency, months: monthData }
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
      const map = p.currency === 'USD' ? execMap.usd : execMap.cop
      const executed = map.get(key) || 0
      const plan = Number(p.plan)
      return {
        id: p.id,
        month_label: p.month_label,
        event_type: p.event_type,
        level_2: p.level_2,
        level_3: p.level_3,
        base: Number(p.base),
        inflation: Number(p.inflation),
        currency: p.currency,
        plan,
        executed,
        diff: executed - plan,
        achievement: plan > 0 ? executed / plan : null,
      }
    })

    const sumTotals = (eventType: string, currency: string) => {
      const subset = rows.filter(r => r.event_type === eventType && r.currency === currency)
      return {
        plan: subset.reduce((s, r) => s + r.plan, 0),
        exec: subset.reduce((s, r) => s + r.executed, 0),
      }
    }

    const totals = {
      COP: {
        income_plan: sumTotals('Income', 'COP').plan,
        income_exec: sumTotals('Income', 'COP').exec,
        expense_plan: sumTotals('Expense', 'COP').plan,
        expense_exec: sumTotals('Expense', 'COP').exec,
      },
      USD: {
        income_plan: sumTotals('Income', 'USD').plan,
        income_exec: sumTotals('Income', 'USD').exec,
        expense_plan: sumTotals('Expense', 'USD').plan,
        expense_exec: sumTotals('Expense', 'USD').exec,
      },
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
    const { event_type, level_2, level_3, months, amount, currency } = body

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
    const currencyValue: 'COP' | 'USD' = currency === 'USD' ? 'USD' : 'COP'

    const level3Value: string | null = level_3 || null

    // Guard against mismatches: the category/subcategory must exist in Data Source.
    const catMatch = await prisma.categoryDef.findFirst({
      where: { user_id: userId, level_1: event_type, level_2, level_3: level3Value },
    })
    if (!catMatch) {
      return NextResponse.json({ error: 'This category/subcategory is not defined in Data Source' }, { status: 400 })
    }

    await Promise.all(
      months.map((m: string) => upsertPlanRow(userId, m, event_type, level_2, level3Value, amountNum, currencyValue))
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
