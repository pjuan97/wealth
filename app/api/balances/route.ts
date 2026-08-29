import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'
import { accountBalance } from '@/lib/accountBalance'

export async function GET(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const userId = session.id

    // ── 1. Get all active accounts from AccountDef ───────────────────────────
    const accountDefs = await prisma.accountDef.findMany({
      where: { user_id: userId, is_active: true },
      orderBy: { name: 'asc' },
    })

    const cashAccounts = accountDefs.filter(a => a.type === 'cash').map(a => a.name)
    const investmentAccounts = accountDefs.filter(a => a.type === 'investment').map(a => a.name)
    const debtAccounts = accountDefs.filter(a => a.type === 'debt').map(a => a.name)

    // ── 2. Get latest FX rate ────────────────────────────────────────────────
    const fxRate = await prisma.dailyFxRate.findFirst({
      where: { currency: 'USD' },
      orderBy: { date: 'desc' },
    })
    const currentFX = fxRate ? Number(fxRate.rate_to_cop) : 3672

    // ── 3. Calculate balances for CASH accounts from Transactions ────────────
    const cashBalances: Array<{ name: string; type: string; balance: number; balanceUsd: number }> = []

    for (const account of cashAccounts) {
      const { cop, usd } = await accountBalance(userId, account, currentFX)
      cashBalances.push({
        name: account,
        type: 'cash',
        balance: cop,
        balanceUsd: usd,
      })
    }

    // ── 4. Calculate balances for INVESTMENT accounts from EquityExecuted ────
    const investmentBalances: Array<{ name: string; type: string; balance: number; balanceUsd: number }> = []

    // Get latest market_value_end for each investment account
    const latestEquity = await prisma.equityExecuted.findMany({
      where: { user_id: userId, platform: { in: investmentAccounts } },
      orderBy: { month_label: 'desc' },
    })

    // Get equity forecast for monthly rates
    const latestForecast = await prisma.equityForecast.findMany({
      where: { user_id: userId, account: { in: investmentAccounts } },
      orderBy: { month_label: 'desc' },
    })

    for (const account of investmentAccounts) {
      // A platform can hold several rows in the same month (one per equity_type,
      // e.g. ETFs and Companies), so take the latest month that has any manual
      // value and add that whole month up — picking a single row would drop the
      // rest of the portfolio from net worth.
      const manualMonth = latestEquity.find(
        e => e.platform === account && e.market_value_end !== null
      )?.month_label

      let balance = 0

      if (manualMonth) {
        balance = latestEquity
          .filter(e => e.platform === account && e.month_label === manualMonth)
          .reduce((s, e) => s + Number(e.market_value_end ?? 0), 0)
      } else {
        // Fallback: compute from transactions
        const forecast = latestForecast.find(f => f.account === account)
        const latestExec = latestEquity.find(e => e.platform === account)

        if (latestExec) {
          const monthly_rate = forecast ? Number(forecast.monthly_rate) : 0.007974
          const start = Number(latestExec.start_balance)

          // Net flow from all transactions involving this account
          const [inflow, outflow] = await Promise.all([
            prisma.transaction.aggregate({
              where: {
                user_id: userId,
                to_account: account,
                event_type: { notIn: ['Opening_Balance'] },
              },
              _sum: { amount: true },
            }),
            prisma.transaction.aggregate({
              where: {
                user_id: userId,
                from_account: account,
                event_type: { notIn: ['Opening_Balance'] },
              },
              _sum: { amount: true },
            }),
          ])

          const netFlow = Number(inflow._sum.amount || 0) - Number(outflow._sum.amount || 0)
          balance = Math.round(start * (1 + monthly_rate) + netFlow)
        }
      }

      investmentBalances.push({
        name: account,
        type: 'investment',
        balance,
        balanceUsd: balance / currentFX,
      })
    }

    // ── 5. Calculate balances for DEBT accounts from Transactions ────────────
    const debtBalances: Array<{ name: string; type: string; balance: number; balanceUsd: number }> = []

    for (const account of debtAccounts) {
      // Debt runs the other way round: charges leave the card, payments come in,
      // so what is still owed is the negative of the account's balance.
      const { cop, usd } = await accountBalance(userId, account, currentFX)
      const debt = -cop
      const debtUsd = -usd
      debtBalances.push({
        name: account,
        type: 'debt',
        balance: debt > 0 ? -debt : 0, // negative = liability
        balanceUsd: debt > 0 ? -debtUsd : 0,
      })
    }

    // ── 6. Compute Net Worth ─────────────────────────────────────────────────
    const totalAssets =
      cashBalances.reduce((s, a) => s + Math.max(0, a.balance), 0) +
      investmentBalances.reduce((s, a) => s + Math.max(0, a.balance), 0)

    const totalLiabilities = debtBalances.reduce((s, a) => s + Math.abs(a.balance), 0)
    const netWorth = totalAssets - totalLiabilities

    // Sum each account's own (real, when native) USD balance instead of
    // dividing the COP total by today's rate — matches per-account balanceUsd.
    const totalAssetsUsd =
      cashBalances.reduce((s, a) => s + Math.max(0, a.balanceUsd), 0) +
      investmentBalances.reduce((s, a) => s + Math.max(0, a.balanceUsd), 0)
    const totalLiabilitiesUsd = debtBalances.reduce((s, a) => s + Math.abs(a.balanceUsd), 0)
    const netWorthUsd = totalAssetsUsd - totalLiabilitiesUsd

    // ── 7. Net Worth Evolution (2026 only) ───────────────────────────────────
    const MONTHS_2026 = [
      '2026-01','2026-02','2026-03','2026-04',
      '2026-05','2026-06','2026-07','2026-08',
      '2026-09','2026-10','2026-11','2026-12',
    ]

    const netWorthEvolution = await Promise.all(
      MONTHS_2026.map(async month => {
        const monthEnd = new Date(`${month}-01`)
        monthEnd.setMonth(monthEnd.getMonth() + 1)

        // Cash balances up to end of month
        let cashTotal = 0
        for (const account of cashAccounts) {
          cashTotal += (await accountBalance(userId, account, currentFX, monthEnd)).cop
        }

        // Investment balances: use market_value_end for this month if available
        let investTotal = 0
        for (const account of investmentAccounts) {
          // Same as above: sum every equity_type row the platform has this month.
          const execRows = await prisma.equityExecuted.findMany({
            where: {
              user_id: userId,
              platform: account,
              month_label: month,
              market_value_end: { not: null },
            },
          })
          if (execRows.length > 0) {
            investTotal += execRows.reduce((s, e) => s + Number(e.market_value_end ?? 0), 0)
          } else {
            // Use forecast projected_end as estimate
            const forecastRows = await prisma.equityForecast.findMany({
              where: { user_id: userId, account, month_label: month },
            })
            investTotal += forecastRows.reduce((s, f) => s + Number(f.projected_end), 0)
          }
        }

        // Debt balances up to end of month
        let debtTotal = 0
        for (const account of debtAccounts) {
          debtTotal += Math.max(0, -(await accountBalance(userId, account, currentFX, monthEnd)).cop)
        }

        return {
          month,
          netWorth: cashTotal + investTotal - debtTotal,
        }
      })
    )

    // ── 8. Build response ────────────────────────────────────────────────────
    const allAccounts = [
      ...cashBalances,
      ...investmentBalances,
      ...debtBalances.filter(a => a.balance < 0),
    ]

    return NextResponse.json({
      netWorth,
      netWorthUsd,
      totalAssets,
      totalAssetsUsd,
      totalLiabilities,
      totalLiabilitiesUsd,
      accounts: allAccounts,
      fxRate: currentFX,
      netWorthEvolution: netWorthEvolution.filter(m => m.netWorth > 0),
    })

  } catch (error) {
    console.error('GET /api/balances error:', error)
    return NextResponse.json({ error: 'Failed to fetch balances' }, { status: 500 })
  }
}
