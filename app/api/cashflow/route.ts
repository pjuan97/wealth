import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'

const MONTHS = [
  '2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
  '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12',
]

function getCurrentMonth(): string {
  const todayKey = new Date().toISOString().slice(0, 7)
  if (MONTHS.includes(todayKey)) return todayKey
  return todayKey < MONTHS[0] ? MONTHS[0] : MONTHS[MONTHS.length - 1]
}

// Get real balance for a set of accounts up to end of a month, in both
// currencies — whichever the account actually transacts in will be non-zero.
async function getAccountBalance(
  accounts: string[],
  upToMonth: string,
  userId: number
): Promise<{ cop: number; usd: number }> {
  if (!accounts.length) return { cop: 0, usd: 0 }

  const monthEnd = new Date(`${upToMonth}-01`)
  monthEnd.setMonth(monthEnd.getMonth() + 1)

  // Cada movimiento cuenta en UNA sola bolsa, la de la moneda en que se hizo:
  // una compra en dólares guarda también su equivalente en pesos, y el cliente
  // suma las dos bolsas, así que ponerla en ambas duplicaría el saldo.
  const lado = async (dir: 'to_account' | 'from_account') => {
    const [enPesos, enDolares] = await Promise.all([
      prisma.transaction.aggregate({
        where: { user_id: userId, [dir]: { in: accounts }, date: { lt: monthEnd }, usd_amount: null },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { user_id: userId, [dir]: { in: accounts }, date: { lt: monthEnd }, usd_amount: { not: null } },
        _sum: { usd_amount: true },
      }),
    ])
    return { cop: Number(enPesos._sum.amount || 0), usd: Number(enDolares._sum.usd_amount || 0) }
  }
  const [inflow, outflow] = await Promise.all([lado('to_account'), lado('from_account')])

  return {
    cop: inflow.cop - outflow.cop,
    usd: inflow.usd - outflow.usd,
  }
}

// Get executed income/expense for a month from transactions, separately in
// COP and USD (a Plan row's currency decides which of the two it's compared
// against — avoids FX-rate drift creating false variance for USD plans).
async function getMonthExecuted(monthLabel: string, userId: number) {
  const txs = await prisma.transaction.findMany({
    where: {
      user_id: userId,
      month_label: monthLabel,
      event_type: { in: ['Income', 'Expense'] },
    },
    select: { event_type: true, level_2: true, level_3: true, amount: true, usd_amount: true },
  })

  // Igual que arriba: un movimiento pertenece a la bolsa de su propia moneda,
  // nunca a las dos.
  const build = (field: 'amount' | 'usd_amount') => {
    const propios = txs.filter(t => (t.usd_amount !== null ? field === 'usd_amount' : field === 'amount'))
    const incomeExec = propios
      .filter(t => t.event_type === 'Income')
      .reduce((s, t) => s + Number(t[field] || 0), 0)
    const expenseExec = propios
      .filter(t => t.event_type === 'Expense')
      .reduce((s, t) => s + Number(t[field] || 0), 0)
    const byCategory: Record<string, number> = {}
    for (const tx of propios) {
      const val = Number(tx[field] || 0)
      if (val === 0) continue
      const key = `${tx.level_2}||${tx.level_3 || ''}`
      byCategory[key] = (byCategory[key] || 0) + val
    }
    return { incomeExec, expenseExec, byCategory }
  }

  return { cop: build('amount'), usd: build('usd_amount') }
}

export async function GET(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.id
  const { searchParams } = new URL(request.url)
  const openingAccountsParam = searchParams.get('openingAccounts')

  const CURRENT_MONTH = getCurrentMonth()

  try {
    // Default opening accounts to this user's own active cash accounts —
    // a hardcoded name from another user's profile would silently zero out.
    let openingAccounts: string[]
    if (openingAccountsParam) {
      openingAccounts = openingAccountsParam.split(',')
    } else {
      const defaultCashAccounts = await prisma.accountDef.findMany({
        where: { user_id: userId, type: 'cash', is_active: true },
        select: { name: true },
        orderBy: { name: 'asc' },
      })
      openingAccounts = defaultCashAccounts.map(a => a.name)
    }

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

    const avgFxRate = fxRates.length > 0
      ? fxRates.reduce((s, r) => s + Number(r.rate_to_cop), 0) / fxRates.length
      : 3672

    const monthlyFx: Record<string, number> = {}
    for (const month of MONTHS) {
      const monthRates = fxRates.filter(r => r.date.toISOString().startsWith(month))
      monthlyFx[month] = monthRates.length > 0
        ? monthRates.reduce((s, r) => s + Number(r.rate_to_cop), 0) / monthRates.length
        : avgFxRate
    }

    // Build category rows with plan and executed data
    const categoryKeys = [...new Set(
      plans.map(p => `${p.event_type}||${p.level_2}||${p.level_3 || ''}`)
    )].sort()

    const executedByMonth: Record<string, Awaited<ReturnType<typeof getMonthExecuted>>> = {}
    for (const month of MONTHS) {
      executedByMonth[month] = await getMonthExecuted(month, userId)
    }

    const categoryRows = categoryKeys.map(ck => {
      const [eventType, level_2, level_3] = ck.split('||')
      const key = `${level_2}||${level_3}`
      // A category's currency is assumed consistent across months — take it from any row that has it.
      const currency = plans.find(p =>
        p.event_type === eventType && p.level_2 === level_2 && (p.level_3 || '') === level_3
      )?.currency || 'COP'

      const monthData = MONTHS.map(m => {
        const plan = plans.find(p =>
          p.month_label === m &&
          p.event_type === eventType &&
          p.level_2 === level_2 &&
          (p.level_3 || '') === level_3
        )
        const execMap = currency === 'USD' ? executedByMonth[m].usd : executedByMonth[m].cop
        const executed = execMap.byCategory[key] || 0
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
        currency,
        months: monthData,
        total: {
          plan: totalPlan,
          executed: totalExec,
          diff: totalExec - totalPlan,
          variance: totalPlan > 0 ? (totalExec - totalPlan) / totalPlan : null,
        },
      }
    })

    // Build monthly summary with ROLLING opening balance, computed separately per currency.
    const openingBalanceStart = await getAccountBalance(openingAccounts, '2025-12', userId)

    const buildMonthlySummary = (curr: 'cop' | 'usd') => {
      const rows = []
      let rollingBalance = curr === 'cop' ? openingBalanceStart.cop : openingBalanceStart.usd

      for (let i = 0; i < MONTHS.length; i++) {
        const m = MONTHS[i]
        const isPast = m < CURRENT_MONTH
        const isCurrent = m === CURRENT_MONTH

        const openingBalance = rollingBalance
        const exec = executedByMonth[m][curr]
        const mPlans = plans.filter(p => p.month_label === m && p.currency.toLowerCase() === curr)

        const incomePlan = mPlans.filter(p => p.event_type === 'Income').reduce((s, p) => s + Number(p.plan), 0)
        const expensePlan = mPlans.filter(p => p.event_type === 'Expense').reduce((s, p) => s + Number(p.plan), 0)
        const incomeExec = exec.incomeExec
        const expenseExec = exec.expenseExec

        // For future months, use plan as projection.
        const incomeEffective = (isPast || isCurrent) ? incomeExec : incomePlan
        const expenseEffective = (isPast || isCurrent) ? expenseExec : expensePlan

        const resultadoPlan = incomePlan - expensePlan
        const resultadoExec = incomeExec - expenseExec
        const resultadoEffective = incomeEffective - expenseEffective

        const balancePlan = openingBalance + resultadoPlan
        const balanceExec = openingBalance + resultadoExec
        const balanceEffective = openingBalance + resultadoEffective

        rollingBalance = (isPast || isCurrent) ? balanceExec : balancePlan

        rows.push({
          openingBalance, incomePlan, incomeExec, expensePlan, expenseExec,
          resultadoPlan, resultadoExec, balancePlan, balanceExec,
        })
      }
      return rows
    }

    const copSummary = buildMonthlySummary('cop')
    const usdSummary = buildMonthlySummary('usd')

    const monthlySummary = MONTHS.map((m, i) => {
      const isPast = m < CURRENT_MONTH
      const isCurrent = m === CURRENT_MONTH
      return {
        month: m,
        isPast,
        isCurrent,
        isFuture: !isPast && !isCurrent,
        fx: monthlyFx[m] || avgFxRate,
        COP: copSummary[i],
        USD: usdSummary[i],
      }
    })

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
