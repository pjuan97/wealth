import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchAndStoreTodayRate, getRecentRates, getMonthlyFxMap } from '@/lib/fxService'

// GET /api/fx-rates — returns recent daily rates + monthly rates
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') // 'daily' | 'monthly' | 'monthly-map' | 'today'

  try {
    if (type === 'today') {
      const rate = await fetchAndStoreTodayRate()
      return NextResponse.json(rate)
    }

    if (type === 'monthly') {
      const rates = await prisma.fxRate.findMany({
        orderBy: { month_label: 'asc' },
      })
      return NextResponse.json(rates)
    }

    // Averaged daily TRM per month (2026-01..12), for converting an amount from
    // its native currency into the display currency the user has chosen.
    if (type === 'monthly-map') {
      const map = await getMonthlyFxMap()
      return NextResponse.json(map)
    }

    // Default: daily rates (last 90 days) + today's rate
    const [daily, monthly] = await Promise.all([
      getRecentRates(90),
      prisma.fxRate.findMany({ orderBy: { month_label: 'desc' }, take: 6 }),
    ])

    return NextResponse.json({ daily, monthly })
  } catch (error) {
    console.error('GET /api/fx-rates error:', error)
    return NextResponse.json({ error: 'Failed to fetch FX rates' }, { status: 500 })
  }
}

// POST /api/fx-rates/fetch — manual trigger
export async function POST() {
  try {
    const result = await fetchAndStoreTodayRate()
    return NextResponse.json({
      success: true,
      ...result,
      message: result.cached
        ? 'Rate already fetched today'
        : `Fetched: 1 USD = ${result.rate_to_cop} COP`,
    })
  } catch (error) {
    console.error('POST /api/fx-rates error:', error)
    return NextResponse.json({ error: 'Failed to fetch rate' }, { status: 500 })
  }
}
