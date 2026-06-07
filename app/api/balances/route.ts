import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'

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
      const [inflow, outflow] = await Promise.all([
        prisma.transaction.aggregate({
          where: { user_id: userId, to_account: account },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: { user_id: userId, from_account: account },
          _sum: { amount: true },
        }),
      ])
      const balance = Number(inflow._sum.amount || 0) - Number(outflow._sum.amount || 0)
      cashBalances.push({
        name: account,
        type: 'cash',
        balance,
        balanceUsd: balance / currentFX,
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
      // Try manual market_value_end first
      const withManual = latestEquity.find(
        e => e.platform === account && e.market_value_end !== null
      )

      let balance = 0

      if (withManual) {
        balance = Number(withManual.market_value_end)
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
      // Debt: money that came FROM the account (was spent) minus payments TO the account
      const [charged, paid] = await Promise.all([
        prisma.transaction.aggregate({
          where: { user_id: userId, from_account: account },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: { user_id: userId, to_account: account },
          _sum: { amount: true },
        }),
      ])
      // Outstanding debt = what was charged - what was paid
      const debt = Number(charged._sum.amount || 0) - Number(paid._sum.amount || 0)
      debtBalances.push({
        name: account,
        type: 'debt',
        balance: debt > 0 ? -debt : 0, // negative = liability
        balanceUsd: debt > 0 ? -(debt / currentFX) : 0,
      })
    }

    // ── 6. Compute Net Worth ─────────────────────────────────────────────────
    const totalAssets =
      cashBalances.reduce((s, a) => s + Math.max(0, a.balance), 0) +
      investmentBalances.reduce((s, a) => s + Math.max(0, a.balance), 0)

    const totalLiabilities = debtBalances.reduce((s, a) => s + Math.abs(a.balance), 0)
    const netWorth = totalAssets - totalLiabilities

    const totalAssetsUsd = totalAssets / currentFX
    const totalLiabilitiesUsd = totalLiabilities / currentFX
    const netWorthUsd = netWorth / currentFX

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
          const [inflow, outflow] = await Promise.all([
            prisma.transaction.aggregate({
              where: { user_id: userId, to_account: account, date: { lt: monthEnd } },
              _sum: { amount: true },
            }),
            prisma.transaction.aggregate({
              where: { user_id: userId, from_account: account, date: { lt: monthEnd } },
              _sum: { amount: true },
            }),
          ])
          cashTotal += Number(inflow._sum.amount || 0) - Number(outflow._sum.amount || 0)
        }

        // Investment balances: use market_value_end for this month if available
        let investTotal = 0
        for (const account of investmentAccounts) {
          const execRow = await prisma.equityExecuted.findFirst({
            where: {
              user_id: userId,
              platform: account,
              month_label: month,
              market_value_end: { not: null },
            },
          })
          if (execRow) {
            investTotal += Number(execRow.market_value_end)
          } else {
            // Use forecast projected_end as estimate
            const forecastRow = await prisma.equityForecast.findFirst({
              where: { user_id: userId, account, month_label: month },
            })
            if (forecastRow) {
              investTotal += Number(forecastRow.projected_end)
            }
          }
        }

        // Debt balances up to end of month
        let debtTotal = 0
        for (const account of debtAccounts) {
          const [charged, paid] = await Promise.all([
            prisma.transaction.aggregate({
              where: { user_id: userId, from_account: account, date: { lt: monthEnd } },
              _sum: { amount: true },
            }),
            prisma.transaction.aggregate({
              where: { user_id: userId, to_account: account, date: { lt: monthEnd } },
              _sum: { amount: true },
            }),
          ])
          debtTotal += Math.max(0, Number(charged._sum.amount || 0) - Number(paid._sum.amount || 0))
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
