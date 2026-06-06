import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'

const INVESTMENT_ACCOUNTS = [
  'Bancolombia Fiduciary', 'Trii', 'Dollar App', 'Tyba', 'Interactive Brokers',
]

const ASSET_ACCOUNTS = [
  'Bancolombia (Cash)',
  'Bancolombia Fiduciary',
  'Trii',
  'Tyba',
  'Dollar App',
  'Interactive Brokers',
  'Loans',
]

const LIABILITY_ACCOUNTS = [
  'Credit Cards',
  'Loans',
]

async function computeBalances(userId: number, upToMonth?: string) {
  const where = {
    user_id: userId,
    ...(upToMonth ? { month_label: { lte: upToMonth } } : {}),
  }

  const transactions = await prisma.transaction.findMany({
    where,
    select: {
      amount: true,
      from_account: true,
      to_account: true,
    },
  })

  const balanceMap: Record<string, number> = {}

  for (const t of transactions) {
    const amount = Number(t.amount)
    if (t.to_account) {
      balanceMap[t.to_account] = (balanceMap[t.to_account] || 0) + amount
    }
    if (t.from_account) {
      balanceMap[t.from_account] = (balanceMap[t.from_account] || 0) - amount
    }
  }

  return balanceMap
}

export async function GET(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.id

  try {
    // Current balances (all months)
    const currentBalances = await computeBalances(userId)

    // Get latest market_value_end for each investment account
    const latestEquity = await prisma.equityExecuted.findMany({
      where: {
        user_id: userId,
        platform: { in: INVESTMENT_ACCOUNTS },
        market_value_end: { not: null },
      },
      orderBy: { month_label: 'desc' },
    })

    // Build map: account -> latest market_value_end
    const equityMap = new Map<string, number>()
    for (const e of latestEquity) {
      if (!equityMap.has(e.platform)) {
        equityMap.set(e.platform, Number(e.market_value_end))
      }
    }

    // Build account list with classification
    const ALL_ACCOUNTS = [
      'Bancolombia (Cash)',
      'Bancolombia Fiduciary',
      'Credit Cards',
      'Trii',
      'Tyba',
      'Dollar App',
      'Loans',
      'Interactive Brokers',
    ]

    const accounts = ALL_ACCOUNTS.map(name => {
      const transactionBalance = currentBalances[name] || 0
      const balance = INVESTMENT_ACCOUNTS.includes(name)
        ? (equityMap.get(name) ?? transactionBalance)
        : transactionBalance
      let type: 'asset' | 'liability' | 'neutral' = 'neutral'
      if (ASSET_ACCOUNTS.includes(name) && balance >= 0) type = 'asset'
      if (LIABILITY_ACCOUNTS.includes(name) && balance < 0) type = 'liability'
      if (name === 'Loans' && balance > 0) type = 'asset'
      if (name === 'Loans' && balance < 0) type = 'liability'
      return { name, balance, type }
    })

    const totalAssets = accounts
      .filter(a => a.type === 'asset')
      .reduce((s, a) => s + a.balance, 0)

    const totalLiabilities = accounts
      .filter(a => a.type === 'liability')
      .reduce((s, a) => s + Math.abs(a.balance), 0)

    const netWorth = totalAssets - totalLiabilities

    // Monthly net worth evolution
    const monthsRaw = await prisma.transaction.findMany({
      where: { user_id: userId },
      select: { month_label: true },
      distinct: ['month_label'],
      orderBy: { month_label: 'asc' },
    })

    const months = monthsRaw
      .map(r => r.month_label)
      .filter(m => m !== null) as string[]

    const monthlyNetWorth = await Promise.all(
      months.map(async (month) => {
        const balances = await computeBalances(userId, month)
        const assets = ASSET_ACCOUNTS.reduce((s, name) => {
          const b = balances[name] || 0
          return s + (b > 0 ? b : 0)
        }, 0)
        const liabilities = LIABILITY_ACCOUNTS.reduce((s, name) => {
          const b = balances[name] || 0
          return s + (b < 0 ? Math.abs(b) : 0)
        }, 0)
        return {
          month,
          netWorth: assets - liabilities,
          assets,
          liabilities,
        }
      })
    )

    // Get FX rates for USD conversion
    const fxRates = await prisma.fxRate.findMany({
      orderBy: { month_label: 'desc' },
      take: 1,
    })
    const latestFxRate = fxRates[0] ? Number(fxRates[0].rate_to_cop) : 3700

    return NextResponse.json({
      accounts,
      totalAssets,
      totalLiabilities,
      netWorth,
      monthlyNetWorth,
      latestFxRate,
    })
  } catch (error) {
    console.error('GET /api/balances error:', error)
    return NextResponse.json({ error: 'Failed to compute balances' }, { status: 500 })
  }
}
