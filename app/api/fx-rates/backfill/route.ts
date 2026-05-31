import { NextRequest, NextResponse } from 'next/server'
import { backfillRates } from '@/lib/fxService'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { from, to } = body

    if (!from || !to) {
      return NextResponse.json(
        { error: 'from and to dates required (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    // Validate dates
    const fromDate = new Date(from + 'T00:00:00Z')
    const toDate = new Date(to + 'T00:00:00Z')

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }

    if (fromDate > toDate) {
      return NextResponse.json(
        { error: 'from date must be before to date' },
        { status: 400 }
      )
    }

    // Max 90 days per request to avoid timeout
    const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays > 90) {
      return NextResponse.json(
        { error: 'Maximum range is 90 days per request' },
        { status: 400 }
      )
    }

    console.log(`[FX Backfill] Starting: ${from} → ${to}`)
    const result = await backfillRates(from, to)
    console.log(`[FX Backfill] Done: ${result.filled} filled, ${result.skipped} skipped, ${result.errors} errors`)

    return NextResponse.json({
      success: true,
      ...result,
      message: `Filled ${result.filled} days, skipped ${result.skipped} existing`,
    })
  } catch (error) {
    console.error('[FX Backfill] Error:', error)
    return NextResponse.json({ error: 'Backfill failed' }, { status: 500 })
  }
}
