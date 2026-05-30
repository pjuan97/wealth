import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

async function computeBalances(upToMonth?: string) {
  // Get all transactions up to and including the given month
  const where = upToMonth
    ? { month_label: { lte: upToMonth } }
    : {}

  const transactions = await prisma.transaction.findMany({
    where,
    select: {
      amount: true,
      from_account: true,
      to_account: true,
    },
  })

  // Compute raw balance per account
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

export async function GET() {
  try {
    // Current balances (all months)
    const currentBalances = await computeBalances()

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
      const balance = currentBalances[name] || 0
      let type: 'asset' | 'liability' | 'neutral' = 'neutral'
      if (ASSET_ACCOUNTS.includes(name) && balance >= 0) type = 'asset'
      if (LIABILITY_ACCOUNTS.includes(name) && balance < 0) type = 'liability'
      if (name === 'Loans' && balance > 0) type = 'asset'
      if (name === 'Loans' && balance < 0) type = 'liability'
      return { name, balance, type }
    }).filter(a => a.balance !== 0 || ASSET_ACCOUNTS.includes(a.name))

    const totalAssets = accounts
      .filter(a => a.type === 'asset')
      .reduce((s, a) => s + a.balance, 0)

    const totalLiabilities = accounts
      .filter(a => a.type === 'liability')
      .reduce((s, a) => s + Math.abs(a.balance), 0)

    const netWorth = totalAssets - totalLiabilities

    // Monthly net worth evolution
    // Get distinct months present in transactions
    const monthsRaw = await prisma.transaction.findMany({
      select: { month_label: true },
      distinct: ['month_label'],
      orderBy: { month_label: 'asc' },
    })

    const months = monthsRaw
      .map(r => r.month_label)
      .filter(m => m !== null) as string[]

    const monthlyNetWorth = await Promise.all(
      months.map(async (month) => {
        const balances = await computeBalances(month)
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
