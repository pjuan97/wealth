import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { transactions } = await request.json()
    if (!transactions?.length) {
      return NextResponse.json({ duplicateIndices: [] })
    }

    // Get all existing transactions for this user
    const existing = await prisma.transaction.findMany({
      where: { user_id: session.id },
      select: { notes: true, month_label: true },
    })

    // Build lookup set: notes (normalized) + month_label
    const existingKeys = new Set(
      existing
        .filter(tx => tx.notes)
        .map(tx => {
          const notes = (tx.notes || '').trim().toLowerCase()
          const month = tx.month_label || ''
          return `${month}|${notes}`
        })
    )

    // Check each incoming transaction
    const duplicateIndices: number[] = []

    transactions.forEach((tx: {
      date?: string
      notes?: string
    }, index: number) => {
      if (!tx.notes?.trim()) return // skip if no notes

      // Extract month from date
      const dateStr = tx.date || ''
      const month = dateStr.length >= 7
        ? dateStr.substring(0, 7) // '2026-05' from '2026-05-03'
        : ''

      if (!month) return

      const notes = tx.notes.trim().toLowerCase()
      const key = `${month}|${notes}`

      if (existingKeys.has(key)) {
        duplicateIndices.push(index)
      }
    })

    return NextResponse.json({
      duplicateIndices,
      duplicateCount: duplicateIndices.length,
      totalChecked: transactions.length,
    })
  } catch (error) {
    console.error('POST /api/ai-import/check-duplicates error:', error)
    return NextResponse.json({ error: 'Failed to check duplicates' }, { status: 500 })
  }
}
