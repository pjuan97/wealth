import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Compute executed amounts from transactions
async function computeExecuted(monthLabel: string) {
  const transactions = await prisma.transaction.findMany({
    where: {
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
    // Also accumulate at level_2 level (for plan rows where level_3 IS NULL)
    // Only when level_3 is non-empty to avoid double-counting
    if (key3 !== '') {
      const key2Only = `${key2}||`
      map.set(key2Only, (map.get(key2Only) || 0) + Number(tx.amount))
    }
  }

  return map
}

// GET /api/plan?month=2026-01 → monthly view
// GET /api/plan?view=annual   → all months summary
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  const view = searchParams.get('view')

  try {
    if (view === 'annual') {
      // Get all plan rows
      const plans = await prisma.planVsAchievement.findMany({
        orderBy: [{ month_label: 'asc' }, { event_type: 'asc' }, { level_2: 'asc' }],
      })

      // Get all distinct months
      const months = [...new Set(plans.map(p => p.month_label))].sort()

      // Compute executed for all months in parallel
      const executedByMonth = await Promise.all(
        months.map(async m => ({ month: m, map: await computeExecuted(m) }))
      )
      const execMaps = Object.fromEntries(
        executedByMonth.map(({ month: m, map }) => [m, map])
      )

      // Build annual summary: income vs expense by month
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

      // Category breakdown for annual view
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
        where: { month_label: targetMonth },
        orderBy: [{ event_type: 'asc' }, { level_2: 'asc' }, { level_3: 'asc' }],
      }),
      computeExecuted(targetMonth),
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

    // Monthly totals
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

// PATCH /api/plan — update plan value for a row
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, base, plan } = body

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

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
