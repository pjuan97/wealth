import { prisma } from './prisma'

const CURRENT_URL = 'https://open.er-api.com/v6/latest/USD'
const HISTORICAL_BASE = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api'

// ─── Fetch TODAY from open.er-api.com ────────────────────────────────────────
export async function fetchAndStoreTodayRate(): Promise<{
  date: string
  rate_to_cop: number
  rate_from_cop: number
  cached: boolean
}> {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const dateStr = today.toISOString().split('T')[0]

  const existing = await prisma.dailyFxRate.findUnique({
    where: { date_currency: { date: today, currency: 'USD' } },
  })

  if (existing) {
    return {
      date: dateStr,
      rate_to_cop: Number(existing.rate_to_cop),
      rate_from_cop: Number(existing.rate_from_cop),
      cached: true,
    }
  }

  const res = await fetch(CURRENT_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`FX API error: ${res.status}`)
  const data = await res.json()
  const copRate = data.rates?.COP
  if (!copRate) throw new Error('COP rate not found')

  const rate_to_cop = Math.round(copRate * 100) / 100
  const rate_from_cop = 1 / copRate

  await prisma.dailyFxRate.create({
    data: { date: today, currency: 'USD', rate_to_cop, rate_from_cop },
  })

  return { date: dateStr, rate_to_cop, rate_from_cop, cached: false }
}

// ─── Fetch HISTORICAL date from fawazahmed0/currency-api ────────────────────
export async function fetchAndStoreHistoricalRate(dateStr: string): Promise<{
  date: string
  rate_to_cop: number
  rate_from_cop: number
  cached: boolean
} | null> {
  const date = new Date(dateStr + 'T00:00:00Z')

  const existing = await prisma.dailyFxRate.findUnique({
    where: { date_currency: { date, currency: 'USD' } },
  })

  if (existing) {
    return {
      date: dateStr,
      rate_to_cop: Number(existing.rate_to_cop),
      rate_from_cop: Number(existing.rate_from_cop),
      cached: true,
    }
  }

  try {
    const url = `${HISTORICAL_BASE}@${dateStr}/v1/currencies/usd.json`
    const res = await fetch(url, { cache: 'no-store' })

    if (!res.ok) return null

    const data = await res.json()
    const copRate = data.usd?.cop
    if (!copRate) return null

    const rate_to_cop = Math.round(copRate * 100) / 100
    const rate_from_cop = 1 / copRate

    await prisma.dailyFxRate.upsert({
      where: { date_currency: { date, currency: 'USD' } },
      create: {
        date,
        currency: 'USD',
        rate_to_cop,
        rate_from_cop,
        source: 'fawazahmed0/currency-api',
      },
      update: { rate_to_cop, rate_from_cop },
    })

    return { date: dateStr, rate_to_cop, rate_from_cop, cached: false }
  } catch {
    return null
  }
}

// ─── Get rate for a specific date (with fallbacks) ───────────────────────────
export async function getRateForDate(date: Date): Promise<number | null> {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  const dateStr = d.toISOString().split('T')[0]

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // 1. Try exact date in DB
  const exact = await prisma.dailyFxRate.findUnique({
    where: { date_currency: { date: d, currency: 'USD' } },
  })
  if (exact) return Number(exact.rate_to_cop)

  // 2. If date is in the past → fetch historical and store
  if (d < today) {
    const fetched = await fetchAndStoreHistoricalRate(dateStr)
    if (fetched) return fetched.rate_to_cop
  }

  // 3. Fallback: closest previous date in DB
  const closest = await prisma.dailyFxRate.findFirst({
    where: { currency: 'USD', date: { lte: d } },
    orderBy: { date: 'desc' },
  })
  if (closest) return Number(closest.rate_to_cop)

  // 4. Final fallback: monthly reference rate
  const monthLabel = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const monthly = await prisma.fxRate.findFirst({
    where: { month_label: monthLabel, currency: 'USD' },
  })
  return monthly ? Number(monthly.rate_to_cop) : null
}

// ─── Bulk backfill: fill all missing dates in a range ────────────────────────
export async function backfillRates(
  fromDate: string,
  toDate: string
): Promise<{
  filled: number
  skipped: number
  errors: number
  dates: string[]
}> {
  const start = new Date(fromDate + 'T00:00:00Z')
  const end = new Date(toDate + 'T00:00:00Z')
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // Cap end at yesterday (can't fetch future)
  const effectiveEnd = end > today ? new Date(today.getTime() - 86400000) : end

  let filled = 0
  let skipped = 0
  let errors = 0
  const filledDates: string[] = []

  const current = new Date(start)

  while (current <= effectiveEnd) {
    const dateStr = current.toISOString().split('T')[0]

    // Check if already exists
    const exists = await prisma.dailyFxRate.findUnique({
      where: { date_currency: { date: new Date(current), currency: 'USD' } },
    })

    if (exists) {
      skipped++
    } else {
      const result = await fetchAndStoreHistoricalRate(dateStr)
      if (result && !result.cached) {
        filled++
        filledDates.push(dateStr)
      } else if (result && result.cached) {
        skipped++
      } else {
        errors++
      }
    }

    // Advance one day
    current.setUTCDate(current.getUTCDate() + 1)

    // Rate limit: 1 request per 100ms
    await new Promise(r => setTimeout(r, 100))
  }

  return { filled, skipped, errors, dates: filledDates }
}

// ─── Get recent rates for UI ─────────────────────────────────────────────────
export async function getRecentRates(days = 30) {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - days)
  since.setUTCHours(0, 0, 0, 0)

  return prisma.dailyFxRate.findMany({
    where: { currency: 'USD', date: { gte: since } },
    orderBy: { date: 'desc' },
  })
}
