import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const transactions = await prisma.transaction.findMany({
      select: {
        id: true,
        date: true,
        amount: true,
        notes: true,
        event_type: true,
        level_2: true,
        from_account: true,
        to_account: true,
      },
      orderBy: { date: 'desc' },
    })

    // Find duplicates: same date + same amount + same notes (strict)
    const seen = new Map<string, number>() // key → first tx id
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

    return NextResponse.json({
      duplicateIds: Array.from(duplicateIds),
      count: duplicateIds.size,
      pairs: Math.floor(duplicateIds.size / 2),
    })
  } catch (error) {
    console.error('GET /api/transactions/duplicates error:', error)
    return NextResponse.json({ error: 'Failed to detect duplicates' }, { status: 500 })
  }
}
