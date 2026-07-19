import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  try {
    const where: Record<string, unknown> = { user_id: session.id }

    if (month) {
      where.month_label = month
    } else if (from && to) {
      where.month_label = { gte: from, lte: to }
    }
    // No filter = all transactions

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        date: true,
        month_label: true,
        event_type: true,
        level_1: true,
        level_2: true,
        level_3: true,
        usd_amount: true,
        fx_rate: true,
        amount: true,
        from_account: true,
        to_account: true,
        notes: true,
      },
    })

    return NextResponse.json({
      transactions,
      count: transactions.length,
    })
  } catch (error) {
    console.error('GET /api/transactions/export error:', error)
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 })
  }
}
