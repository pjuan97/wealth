import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.id

  try {
    const transactions = await prisma.transaction.findMany({
      where: { user_id: userId },
      select: {
        id: true,
        date: true,
        amount: true,
        notes: true,
        event_type: true,
        level_2: true,
        level_3: true,
        usd_amount: true,
        from_account: true,
        to_account: true,
        month_label: true,
      },
      orderBy: { date: 'desc' },
    })

    const seen = new Map<string, number>()
    const duplicateIds = new Set<number>()

    for (const tx of transactions) {
      const key = [
        tx.date ? new Date(tx.date).toISOString().split('T')[0] : '',
        String(tx.amount || ''),
        (tx.notes || '').trim().toLowerCase(),
      ].join('|')

      if (seen.has(key)) {
        duplicateIds.add(tx.id)
        duplicateIds.add(seen.get(key)!)
      } else {
        seen.set(key, tx.id)
      }
    }

    // Build groups for the modal
    const groups: Record<string, typeof transactions> = {}

    for (const tx of transactions) {
      const key = [
        tx.date ? new Date(tx.date).toISOString().split('T')[0] : '',
        String(tx.amount || ''),
        (tx.notes || '').trim().toLowerCase(),
      ].join('|')

      if (!groups[key]) groups[key] = []
      groups[key].push(tx)
    }

    // Only groups with 2+ transactions
    const duplicateGroups = Object.entries(groups)
      .filter(([, txs]) => txs.length >= 2)
      .map(([key, txs]) => ({ key, transactions: txs }))

    return NextResponse.json({
      duplicateIds: Array.from(duplicateIds),
      count: duplicateIds.size,
      pairs: Math.floor(duplicateIds.size / 2),
      groups: duplicateGroups,
    })
  } catch (error) {
    console.error('GET /api/transactions/duplicates error:', error)
    return NextResponse.json({ error: 'Failed to detect duplicates' }, { status: 500 })
  }
}
