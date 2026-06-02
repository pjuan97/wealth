import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const MONTHS_2026 = [
  '2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
  '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12',
]

// Compute executed amounts for all months at once
async function computeAllExecuted() {
  const transactions = await prisma.transaction.findMany({
    where: { event_type: { in: ['Income', 'Expense'] } },
    select: { month_label: true, level_2: true, level_3: true, amount: true, event_type: true },
  })

  // Map: month → key → amount
  const map = new Map<string, Map<string, number>>()

  for (const tx of transactions) {
    const m = tx.month_label
    const key = `${tx.level_2}||${tx.level_3 || ''}`
    const key2 = `${tx.level_2}||`

    if (!map.has(m)) map.set(m, new Map())
    const mMap = map.get(m)!

    mMap.set(key, (mMap.get(key) || 0) + Number(tx.amount))
    if (key !== key2) {
      mMap.set(key2, (mMap.get(key2) || 0) + Number(tx.amount))
    }
  }

  return map
}

// Get opening balance for a month (sum of inflows minus outflows into Bancolombia Cash before this month)
async function getOpeningBalance(monthLabel: string): Promise<number> {
  const monthStart = new Date(`${monthLabel}-01`)

  const [inflow, outflow] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        to_account: 'Bancolombia (Cash)',
        date: { lt: monthStart },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        from_account: 'Bancolombia (Cash)',
        date: { lt: monthStart },
      },
      _sum: { amount: true },
    }),
  ])

  return Number(inflow._sum.amount || 0) - Number(outflow._sum.amount || 0)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const openingAccount = searchParams.get('account') || 'Bancolombia (Cash)'

  try {
    // Get all plan data
    const plans = await prisma.planVsAchievement.findMany({
      orderBy: [{ month_label: 'asc' }, { event_type: 'asc' }, { level_2: 'asc' }],
    })

    // Get all executed data
    const execMap = await computeAllExecuted()

    // Get distinct categories from plans
    const categoryKeys = [...new Set(
      plans.map(p => `${p.event_type}||${p.level_2}||${p.level_3 || ''}`)
    )].sort()

    // Build category rows
    const categoryRows = categoryKeys.map(ck => {
      const [eventType, level_2, level_3] = ck.split('||')

      const monthData = MONTHS_2026.map(m => {
        const plan = plans.find(p =>
          p.month_label === m &&
          p.event_type === eventType &&
          p.level_2 === level_2 &&
          (p.level_3 || '') === level_3
        )
        const mExecMap = execMap.get(m)
        const key = `${level_2}||${level_3}`
        const executed = mExecMap?.get(key) || 0
        const planVal = plan ? Number(plan.plan) : 0
        const diff = executed - planVal
        const variance = planVal > 0 ? diff / planVal : null

        return { month: m, plan: planVal, executed, diff, variance }
      })

      // Annual totals
      const totalPlan = monthData.reduce((s, m) => s + m.plan, 0)
      const totalExecuted = monthData.reduce((s, m) => s + m.executed, 0)
      const totalDiff = totalExecuted - totalPlan
      const totalVariance = totalPlan > 0 ? totalDiff / totalPlan : null

      return {
        eventType,
        level_2,
        level_3: level_3 || null,
        months: monthData,
        total: { plan: totalPlan, executed: totalExecuted, diff: totalDiff, variance: totalVariance },
      }
    })

    // Build monthly summary (Income, Expense, Resultado, Balance)
    const monthlySummary = await Promise.all(MONTHS_2026.map(async m => {
      const mPlans = plans.filter(p => p.month_label === m)
      const mExecMap = execMap.get(m)

      const incomePlan = mPlans.filter(p => p.event_type === 'Income').reduce((s, p) => s + Number(p.plan), 0)
      const expensePlan = mPlans.filter(p => p.event_type === 'Expense').reduce((s, p) => s + Number(p.plan), 0)

      // Executed income/expense
      let incomeExec = 0
      let expenseExec = 0
      if (mExecMap) {
        for (const [key, val] of mExecMap) {
          if (!key.endsWith('||')) continue
          const l2 = key.replace('||', '')
          const planRow = mPlans.find(p => p.level_2 === l2)
          if (planRow?.event_type === 'Income') incomeExec += val
          if (planRow?.event_type === 'Expense') expenseExec += val
        }
      }

      const openingBalance = await getOpeningBalance(m)

      return {
        month: m,
        opening_balance: openingBalance,
        income_plan: incomePlan,
        income_exec: incomeExec,
        expense_plan: expensePlan,
        expense_exec: expenseExec,
        resultado_plan: incomePlan - expensePlan,
        resultado_exec: incomeExec - expenseExec,
        balance_plan: openingBalance + (incomePlan - expensePlan),
        balance_exec: openingBalance + (incomeExec - expenseExec),
      }
    }))

    return NextResponse.json({ categoryRows, monthlySummary, months: MONTHS_2026 })
  } catch (error) {
    console.error('GET /api/cashflow error:', error)
    return NextResponse.json({ error: 'Failed to fetch cashflow' }, { status: 500 })
  }
}

// PATCH — bulk update plan values for a category across multiple months
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { event_type, level_2, level_3, value, months } = body
    // months: 'all' | string[] (e.g. ['2026-03', '2026-04', ...])

    const targetMonths = months === 'all' ? MONTHS_2026 : months

    const rows = await prisma.planVsAchievement.findMany({
      where: {
        event_type,
        level_2,
        level_3: level_3 || null,
        month_label: { in: targetMonths },
      },
    })

    await Promise.all(rows.map(r =>
      prisma.planVsAchievement.update({
        where: { id: r.id },
        data: { plan: parseFloat(value) },
      })
    ))

    return NextResponse.json({ updated: rows.length })
  } catch (error) {
    console.error('PATCH /api/cashflow error:', error)
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 })
  }
}
