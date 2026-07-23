import { NextRequest, NextResponse } from 'next/server'
import { fetchAndStoreTodayRate } from '@/lib/fxService'

export const maxDuration = 30

// Called once a day by Vercel Cron (see vercel.json) to fetch and store the
// day's USD/COP rate. Replaces the old setInterval-based cron, which never
// actually fired in serverless (functions are ephemeral, no long-lived timer).
//
// When CRON_SECRET is set, Vercel sends it as `Authorization: Bearer <secret>`
// and we reject anything else, so the public internet can't trigger writes.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

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
    console.error('GET /api/fx-rates/cron error:', error)
    return NextResponse.json({ error: 'Failed to fetch rate' }, { status: 500 })
  }
}
