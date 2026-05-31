import { prisma } from './prisma'

const BASE_URL = 'https://open.er-api.com/v6/latest/USD'

export async function fetchAndStoreTodayRate(): Promise<{
  date: string
  rate_to_cop: number
  rate_from_cop: number
  cached: boolean
}> {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const dateStr = today.toISOString().split('T')[0]

  // Check if already fetched today
  const existing = await prisma.dailyFxRate.findUnique({
    where: {
      date_currency: {
        date: today,
        currency: 'USD',
      },
    },
  })

  if (existing) {
    return {
      date: dateStr,
      rate_to_cop: Number(existing.rate_to_cop),
      rate_from_cop: Number(existing.rate_from_cop),
      cached: true,
    }
  }

  // Fetch from API
  const res = await fetch(BASE_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`FX API error: ${res.status}`)

  const data = await res.json()
  const copRate = data.rates?.COP

  if (!copRate || typeof copRate !== 'number') {
    throw new Error('COP rate not found in API response')
  }

  const rate_to_cop = Math.round(copRate * 100) / 100
  const rate_from_cop = 1 / copRate

  await prisma.dailyFxRate.create({
    data: {
      date: today,
      currency: 'USD',
      rate_to_cop,
      rate_from_cop,
    },
  })

  return { date: dateStr, rate_to_cop, rate_from_cop, cached: false }
}

export async function getRateForDate(date: Date): Promise<number | null> {
  // Normalize to midnight UTC
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)

  // Try exact date first
  const exact = await prisma.dailyFxRate.findUnique({
    where: { date_currency: { date: d, currency: 'USD' } },
  })
  if (exact) return Number(exact.rate_to_cop)

  // Fall back to closest previous date (weekends/holidays)
  const closest = await prisma.dailyFxRate.findFirst({
    where: {
      currency: 'USD',
      date: { lte: d },
    },
    orderBy: { date: 'desc' },
  })
  if (closest) return Number(closest.rate_to_cop)

  // Fall back to FxRate monthly table
  const monthLabel = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const monthly = await prisma.fxRate.findFirst({
    where: { month_label: monthLabel, currency: 'USD' },
  })
  return monthly ? Number(monthly.rate_to_cop) : null
}

export async function getRecentRates(days = 30) {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - days)
  since.setUTCHours(0, 0, 0, 0)

  return prisma.dailyFxRate.findMany({
    where: {
      currency: 'USD',
      date: { gte: since },
    },
    orderBy: { date: 'desc' },
  })
}
