import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'

const MONTHS = [
  '2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
  '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12',
]

// Get real balance for a set of accounts up to end of a month
async function getAccountBalance(
  accounts: string[],
  upToMonth: string,
  userId: number
): Promise<number> {
  if (!accounts.length) return 0

  const monthEnd = new Date(`${upToMonth}-01`)
  monthEnd.setMonth(monthEnd.getMonth() + 1)

  const [inflow, outflow] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        user_id: userId,
        to_account: { in: accounts },
        date: { lt: monthEnd },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        user_id: userId,
        from_account: { in: accounts },
        date: { lt: monthEnd },
      },
      _sum: { amount: true },
    }),
  ])

  return Number(inflow._sum.amount || 0) - Number(outflow._sum.amount || 0)
}

// Get executed income/expense for a month from transactions
async function getMonthExecuted(monthLabel: string, userId: number) {
  const txs = await prisma.transaction.findMany({
    where: {
      user_id: userId,
      month_label: monthLabel,
      event_type: { in: ['Income', 'Expense'] },
    },
    select: { event_type: true, level_2: true, level_3: true, amount: true },
  })

  const incomeExec = txs
    .filter(t => t.event_type === 'Income')
    .reduce((s, t) => s + Number(t.amount), 0)

  const expenseExec = txs
    .filter(t => t.event_type === 'Expense')
    .reduce((s, t) => s + Number(t.amount), 0)

  // By category
  const byCategory: Record<string, number> = {}
  for (const tx of txs) {
    const key = `${tx.level_2}||${tx.level_3 || ''}`
    byCategory[key] = (byCategory[key] || 0) + Number(tx.amount)
  }

  return { incomeExec, expenseExec, byCategory }
}

export async function GET(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const openingAccountsParam = searchParams.get('openingAccounts')
  const openingAccounts = openingAccountsParam
    ? openingAccountsParam.split(',')
    : ['Bancolombia (Cash)', 'Dollar App (Cash)']

  const CURRENT_MONTH = '2026-06'
  const userId = session.id

  try {
    // Get all plan data
    const plans = await prisma.planVsAchievement.findMany({
      where: { user_id: userId },
      orderBy: [{ month_label: 'asc' }, { event_type: 'asc' }, { level_2: 'asc' }],
    })

    // Get FX rates for COP/USD conversion
    const fxRates = await prisma.dailyFxRate.findMany({
      where: { currency: 'USD' },
      orderBy: { date: 'desc' },
      take: 180,
    })

    // Calculate AVG FX rate from available data
    const avgFxRate = fxRates.length > 0
      ? fxRates.reduce((s, r) => s + Number(r.rate_to_cop), 0) / fxRates.length
      : 3672

    // Get monthly FX rates for conversion
    const monthlyFx: Record<string, number> = {}
    for (const month of MONTHS) {
      const monthRates = fxRates.filter(r =>
        r.date.toISOString().startsWith(month)
      )
      monthlyFx[month] = monthRates.length > 0
        ? monthRates.reduce((s, r) => s + Number(r.rate_to_cop), 0) / monthRates.length
        : avgFxRate
    }

    // Build category rows with plan and executed data
    const categoryKeys = [...new Set(
      plans.map(p => `${p.event_type}||${p.level_2}||${p.level_3 || ''}`)
    )].sort()

    // Get executed data for all months
    const executedByMonth: Record<string, Awaited<ReturnType<typeof getMonthExecuted>>> = {}
    for (const month of MONTHS) {
      executedByMonth[month] = await getMonthExecuted(month, userId)
    }

    // Build category rows
    const categoryRows = categoryKeys.map(ck => {
      const [eventType, level_2, level_3] = ck.split('||')
      const key = `${level_2}||${level_3}`

      const monthData = MONTHS.map(m => {
        const plan = plans.find(p =>
          p.month_label === m &&
          p.event_type === eventType &&
          p.level_2 === level_2 &&
          (p.level_3 || '') === level_3
        )
        const executed = executedByMonth[m].byCategory[key] || 0
        const planVal = plan ? Number(plan.plan) : 0
        const diff = executed - planVal
        const variance = planVal > 0 ? diff / planVal : null
        const planId = plan?.id || null

        return { month: m, plan: planVal, executed, diff, variance, planId }
      })

      const totalPlan = monthData.reduce((s, m) => s + m.plan, 0)
      const totalExec = monthData.reduce((s, m) => s + m.executed, 0)

      return {
        eventType,
        level_2,
        level_3: level_3 || null,
        months: monthData,
        total: {
          plan: totalPlan,
          executed: totalExec,
          diff: totalExec - totalPlan,
          variance: totalPlan > 0 ? (totalExec - totalPlan) / totalPlan : null,
        },
      }
    })

    // Build monthly summary with ROLLING opening balance
    const monthlySummary = []
    let rollingBalance = 0

    for (let i = 0; i < MONTHS.length; i++) {
      const m = MONTHS[i]
      const isPast = m < CURRENT_MONTH
      const isCurrent = m === CURRENT_MONTH

      // Opening Balance
      let openingBalance: number
      if (i === 0) {
        // January: real balance from selected accounts at start of year
        openingBalance = await getAccountBalance(openingAccounts, '2025-12', userId)
      } else {
        // Subsequent months: balance from previous month (rolling)
        openingBalance = rollingBalance
      }

      const exec = executedByMonth[m]
      const mPlans = plans.filter(p => p.month_label === m)

      const incomePlan = mPlans
        .filter(p => p.event_type === 'Income')
        .reduce((s, p) => s + Number(p.plan), 0)
      const expensePlan = mPlans
        .filter(p => p.event_type === 'Expense')
        .reduce((s, p) => s + Number(p.plan), 0)

      const incomeExec = exec.incomeExec
      const expenseExec = exec.expenseExec

      // For future months, use plan as projection
      const incomeEffective = (isPast || isCurrent) ? incomeExec : incomePlan
      const expenseEffective = (isPast || isCurrent) ? expenseExec : expensePlan

      const resultadoPlan = incomePlan - expensePlan
      const resultadoExec = incomeExec - expenseExec
      const resultadoEffective = incomeEffective - expenseEffective

      const balancePlan = openingBalance + resultadoPlan
      const balanceExec = openingBalance + resultadoExec
      const balanceEffective = openingBalance + resultadoEffective

      // Rolling balance: for past months use real, for future use projected
      rollingBalance = (isPast || isCurrent) ? balanceExec : balancePlan

      const fx = monthlyFx[m] || avgFxRate

      monthlySummary.push({
        month: m,
        isPast,
        isCurrent,
        isFuture: !isPast && !isCurrent,
        openingBalance,
        incomePlan,
        incomeExec,
        expensePlan,
        expenseExec,
        resultadoPlan,
        resultadoExec,
        balancePlan,
        balanceExec,
        fx,
      })
    }

    // Get available cash accounts for selector
    const cashAccounts = await prisma.accountDef.findMany({
      where: { user_id: userId, type: 'cash', is_active: true },
      select: { name: true },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      categoryRows,
      monthlySummary,
      months: MONTHS,
      avgFxRate,
      monthlyFx,
      cashAccounts: cashAccounts.map(a => a.name),
      openingAccounts,
    })
  } catch (error) {
    console.error('GET /api/cashflow error:', error)
    return NextResponse.json({ error: 'Failed to fetch cashflow' }, { status: 500 })
  }
}

// PATCH — update plan values (bulk or single cell)
export async function PATCH(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const { updates } = body
    // updates: Array<{ planId: number, value: number }>

    if (!updates?.length) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    let updated = 0
    for (const u of updates) {
      await prisma.planVsAchievement.update({
        where: { id: u.planId, user_id: session.id },
        data: { plan: u.value },
      })
      updated++
    }

    return NextResponse.json({ updated })
  } catch (error) {
    console.error('PATCH /api/cashflow error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
