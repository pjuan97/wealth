import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.id

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const name = searchParams.get('name')

  if (!type || !name) {
    return NextResponse.json({ error: 'type and name required' }, { status: 400 })
  }

  try {
    if (type === 'account') {
      const [txFrom, txTo, equityExec, equityForecast] = await Promise.all([
        prisma.transaction.count({ where: { user_id: userId, from_account: name } }),
        prisma.transaction.count({ where: { user_id: userId, to_account: name } }),
        prisma.equityExecuted.count({ where: { user_id: userId, platform: name } }),
        prisma.equityForecast.count({ where: { user_id: userId, account: name } }),
      ])
      return NextResponse.json({
        transactions: txFrom + txTo,
        equity_executed: equityExec,
        equity_forecast: equityForecast,
        total: txFrom + txTo + equityExec + equityForecast,
      })
    }

    if (type === 'category') {
      const [l2, l3] = name.split('||')
      const count = await prisma.transaction.count({
        where: {
          user_id: userId,
          level_2: l2,
          ...(l3 ? { level_3: l3 } : {}),
        },
      })
      return NextResponse.json({ transactions: count, total: count })
    }

    if (type === 'eventType') {
      const count = await prisma.transaction.count({
        where: { user_id: userId, event_type: name },
      })
      return NextResponse.json({ transactions: count, total: count })
    }

    return NextResponse.json({ total: 0 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to count usage' }, { status: 500 })
  }
}
