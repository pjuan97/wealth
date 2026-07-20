import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'

const MONTHS = [
  '2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
  '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12',
]

const MONTH_SHORT: Record<string, string> = {
  '2026-01':'Jan','2026-02':'Feb','2026-03':'Mar','2026-04':'Apr',
  '2026-05':'May','2026-06':'Jun','2026-07':'Jul','2026-08':'Aug',
  '2026-09':'Sep','2026-10':'Oct','2026-11':'Nov','2026-12':'Dec',
}

export async function GET(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.id

  const { searchParams } = new URL(request.url)
  const section = searchParams.get('section') || 'overview'
  const month = searchParams.get('month') || '2026-04'

  try {
    if (section === 'overview') {
      // Every transaction has a real, valid COP-equivalent `amount` (auto-computed
      // from usd_amount x fx_rate at entry time even for USD-native purchases) —
      // unlike Plan, there's no "wrong currency" bug here, so totals stay COP
      // unconditionally. Splitting by currency would silently drop any USD-tagged
      // transaction (e.g. a USD credit card) from a COP-native user's totals.
      const currency: 'COP' | 'USD' = 'COP'
      const transactions = await prisma.transaction.findMany({
        where: { user_id: userId, event_type: { in: ['Income', 'Expense'] } },
        select: { month_label: true, event_type: true, amount: true, level_2: true },
      })

      const monthlySummary = MONTHS.map(m => {
        const mTxs = transactions.filter(t => t.month_label === m)
        const income = mTxs.filter(t => t.event_type === 'Income').reduce((s, t) => s + Number(t.amount), 0)
        const expense = mTxs.filter(t => t.event_type === 'Expense').reduce((s, t) => s + Number(t.amount), 0)
        const balance = income - expense
        const savingsRate = income > 0 ? balance / income : 0
        return { month: m, label: MONTH_SHORT[m], income, expense, balance, savingsRate }
      })

      const withData = monthlySummary.filter(m => m.income > 0 || m.expense > 0)
      const ytd = {
        income: withData.reduce((s, m) => s + m.income, 0),
        expense: withData.reduce((s, m) => s + m.expense, 0),
        balance: withData.reduce((s, m) => s + m.balance, 0),
        savingsRate: 0,
        months: withData.length,
      }
      ytd.savingsRate = ytd.income > 0 ? ytd.balance / ytd.income : 0

      const incomeBySource = MONTHS.map(m => {
        const mTxs = transactions.filter(t => t.month_label === m && t.event_type === 'Income')
        const salary = mTxs.filter(t => t.level_2 === 'Salary').reduce((s, t) => s + Number(t.amount), 0)
        const other = mTxs.filter(t => t.level_2 !== 'Salary').reduce((s, t) => s + Number(t.amount), 0)
        return { month: m, label: MONTH_SHORT[m], salary, other }
      })

      // Expense by category — dynamic Level 2 list from this user's actual data (not a fixed set).
      const expenseCategories = [...new Set(
        transactions.filter(t => t.event_type === 'Expense').map(t => t.level_2)
      )].sort()

      const expenseByCategory = MONTHS.map(m => {
        const mTxs = transactions.filter(t => t.month_label === m && t.event_type === 'Expense')
        const byLevel2: Record<string, number> = {}
        for (const cat of expenseCategories) {
          byLevel2[cat] = mTxs.filter(t => t.level_2 === cat).reduce((s, t) => s + Number(t.amount), 0)
        }
        return { month: m, label: MONTH_SHORT[m], byLevel2 }
      })

      const latestEquity = await prisma.equityExecuted.findMany({
        where: { user_id: userId, market_value_end: { not: null } },
        orderBy: { month_label: 'desc' },
      })
      const equityMap = new Map<string, number>()
      for (const e of latestEquity) {
        if (!equityMap.has(e.platform)) equityMap.set(e.platform, Number(e.market_value_end))
      }
      const totalEquity = Array.from(equityMap.values()).reduce((s, v) => s + v, 0)

      // Cash balance — from this user's own active cash accounts, not a hardcoded name.
      const cashAccountDefs = await prisma.accountDef.findMany({
        where: { user_id: userId, type: 'cash', is_active: true },
        select: { name: true },
      })
      const cashAccountNames = cashAccountDefs.map(a => a.name)
      let cashBalance = 0
      if (cashAccountNames.length) {
        const [inflow, outflow] = await Promise.all([
          prisma.transaction.aggregate({
            where: { user_id: userId, to_account: { in: cashAccountNames } },
            _sum: { amount: true },
          }),
          prisma.transaction.aggregate({
            where: { user_id: userId, from_account: { in: cashAccountNames } },
            _sum: { amount: true },
          }),
        ])
        cashBalance = Number(inflow._sum.amount || 0) - Number(outflow._sum.amount || 0)
      }

      return NextResponse.json({
        currency,
        monthlySummary,
        ytd,
        incomeBySource,
        expenseByCategory,
        expenseCategories,
        netWorth: totalEquity + cashBalance, cashBalance, totalEquity,
      })
    }

    if (section === 'plan') {
      const [plans, transactions] = await Promise.all([
        prisma.planVsAchievement.findMany({
          where: { user_id: userId },
          orderBy: [{ month_label: 'asc' }, { level_2: 'asc' }],
        }),
        prisma.transaction.findMany({
          where: { user_id: userId, event_type: { in: ['Income', 'Expense'] } },
          select: { month_label: true, event_type: true, level_2: true, level_3: true, amount: true, usd_amount: true },
        }),
      ])

      // Which currency this user's Plan is actually denominated in.
      const currency: 'COP' | 'USD' = plans.some(p => p.currency === 'USD') &&
        !plans.some(p => p.currency === 'COP') ? 'USD' : 'COP'
      const field = currency === 'USD' ? 'usd_amount' : 'amount'

      const planVsExec = MONTHS.map(m => {
        const mPlans = plans.filter(p => p.month_label === m)
        const mTxs = transactions.filter(t => t.month_label === m)
        const incomePlan = mPlans.filter(p => p.event_type === 'Income').reduce((s, p) => s + Number(p.plan), 0)
        const expensePlan = mPlans.filter(p => p.event_type === 'Expense').reduce((s, p) => s + Number(p.plan), 0)
        const incomeExec = mTxs.filter(t => t.event_type === 'Income').reduce((s, t) => s + (Number(t[field]) || 0), 0)
        const expenseExec = mTxs.filter(t => t.event_type === 'Expense').reduce((s, t) => s + (Number(t[field]) || 0), 0)
        return {
          month: m, label: MONTH_SHORT[m],
          incomePlan, incomeExec, expensePlan, expenseExec,
          incomeVariance: incomePlan > 0 ? (incomeExec - incomePlan) / incomePlan : null,
          expenseVariance: expensePlan > 0 ? (expenseExec - expensePlan) / expensePlan : null,
        }
      })

      const expenseCategories = [...new Set(
        plans.filter(p => p.event_type === 'Expense').map(p => p.level_2)
      )].sort()

      const expenseByL2 = MONTHS.map(m => {
        const mTxs = transactions.filter(t => t.month_label === m && t.event_type === 'Expense')
        const byLevel2: Record<string, number> = {}
        for (const cat of expenseCategories) {
          byLevel2[cat] = mTxs.filter(t => t.level_2 === cat).reduce((s, t) => s + (Number(t[field]) || 0), 0)
        }
        return { month: m, label: MONTH_SHORT[m], byLevel2 }
      })

      return NextResponse.json({ currency, planVsExec, expenseByL2, expenseCategories })
    }

    if (section === 'monthly') {
      const [plans, transactions] = await Promise.all([
        prisma.planVsAchievement.findMany({
          where: { user_id: userId, month_label: month },
          orderBy: [{ event_type: 'asc' }, { level_2: 'asc' }, { level_3: 'asc' }],
        }),
        prisma.transaction.findMany({
          where: { user_id: userId, month_label: month, event_type: { in: ['Income', 'Expense'] } },
          select: { level_2: true, level_3: true, event_type: true, amount: true, usd_amount: true },
        }),
      ])

      // A category's currency is assumed consistent — take it from any plan row that has it.
      const currencyByCategory = new Map<string, 'COP' | 'USD'>()
      for (const p of plans) {
        const key = `${p.level_2}||${p.level_3 || ''}`
        if (!currencyByCategory.has(key)) currencyByCategory.set(key, p.currency as 'COP' | 'USD')
      }

      const copExecMap = new Map<string, number>()
      const usdExecMap = new Map<string, number>()
      for (const tx of transactions) {
        const key = `${tx.level_2}||${tx.level_3 || ''}`
        const usdVal = Number(tx.usd_amount) || 0
        if (usdVal !== 0) usdExecMap.set(key, (usdExecMap.get(key) || 0) + usdVal)
        else copExecMap.set(key, (copExecMap.get(key) || 0) + (Number(tx.amount) || 0))
      }

      const rows = plans.map(p => {
        const key = `${p.level_2}||${p.level_3 || ''}`
        const currency = p.currency as 'COP' | 'USD'
        const execMap = currency === 'USD' ? usdExecMap : copExecMap
        const executed = execMap.get(key) || 0
        const plan = Number(p.plan)
        const diff = executed - plan
        const variance = plan > 0 ? diff / plan : null
        const achievement = plan > 0 ? executed / plan : null
        return {
          event_type: p.event_type, level_2: p.level_2, level_3: p.level_3, currency,
          plan, executed, diff, variance, achievement,
        }
      })

      // Overall KPIs use whichever currency this month's plans are in (falls back to COP if no plan yet).
      const monthCurrency: 'COP' | 'USD' = plans.length ? (plans[0].currency as 'COP' | 'USD') : 'COP'
      const field = monthCurrency === 'USD' ? 'usd_amount' : 'amount'
      const income = transactions.filter(t => t.event_type === 'Income').reduce((s, t) => s + (Number(t[field]) || 0), 0)
      const expense = transactions.filter(t => t.event_type === 'Expense').reduce((s, t) => s + (Number(t[field]) || 0), 0)

      const expensePie = rows
        .filter(r => r.event_type === 'Expense' && r.executed > 0)
        .map(r => ({ name: r.level_3 || r.level_2, value: r.executed }))

      return NextResponse.json({
        rows, kpis: { income, expense, balance: income - expense, month, currency: monthCurrency }, expensePie,
      })
    }

    if (section === 'equity') {
      const [forecasts, executed] = await Promise.all([
        prisma.equityForecast.findMany({
          where: { user_id: userId },
          orderBy: [{ month_label: 'asc' }, { account: 'asc' }],
        }),
        prisma.equityExecuted.findMany({
          where: { user_id: userId },
          orderBy: [{ month_label: 'asc' }, { platform: 'asc' }],
        }),
      ])

      const accounts = [...new Set(forecasts.map(f => f.account))].sort()

      const portfolioByMonth = MONTHS.map(m => {
        const mForecasts = forecasts.filter(f => f.month_label === m)
        const mExecuted = executed.filter(e => e.month_label === m)
        const planned = mForecasts.reduce((s, f) => s + Number(f.projected_end), 0)
        const exec = mExecuted.filter(e => e.market_value_end !== null)
          .reduce((s, e) => s + Number(e.market_value_end), 0)
        const hasExec = mExecuted.some(e => e.market_value_end !== null)
        return { month: m, label: MONTH_SHORT[m], planned, executed: hasExec ? exec : null }
      })

      const byAccount = accounts.map(account => {
        const monthData = MONTHS.map(m => {
          const f = forecasts.find(x => x.account === account && x.month_label === m)
          const e = executed.find(x => x.platform === account && x.month_label === m)
          const planned = f ? Number(f.projected_end) : 0
          const exec = e?.market_value_end ? Number(e.market_value_end) : null
          const marketPnL = exec !== null && planned > 0 ? exec - planned : null
          return { month: m, label: MONTH_SHORT[m], planned, executed: exec, marketPnL }
        })
        const latestExec = monthData.filter(m => m.executed !== null).pop()
        const latestPlan = monthData.filter(m => m.planned > 0).pop()
        return {
          account,
          equity_type: forecasts.find(f => f.account === account)?.equity_type || '',
          monthData,
          latestPlanned: latestPlan?.planned || 0,
          latestExecuted: latestExec?.executed || null,
        }
      })

      const distributionPie = byAccount
        .filter(a => a.latestExecuted !== null)
        .map(a => ({ name: a.account, value: a.latestExecuted as number }))

      return NextResponse.json({ portfolioByMonth, byAccount, distributionPie, accounts })
    }

    return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
  } catch (error) {
    console.error('GET /api/dashboard error:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}
