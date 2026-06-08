import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { transactions } = await request.json()
    // transactions: Array<{ date, amount, usd_amount, notes }>

    if (!transactions?.length) {
      return NextResponse.json({ duplicateIndices: [] })
    }

    // Get all existing transactions for this user
    // Only fetch what we need for matching
    const existing = await prisma.transaction.findMany({
      where: { user_id: session.id },
      select: {
        date: true,
        amount: true,
        usd_amount: true,
        notes: true,
      },
    })

    // Build lookup set from existing transactions
    // Key: date|amount|notes (strict match)
    const existingKeys = new Set(
      existing.map(tx => {
        const dateStr = tx.date
          ? new Date(tx.date).toISOString().split('T')[0]
          : ''
        const amountStr = String(Number(tx.amount || tx.usd_amount || 0).toFixed(2))
        const notesStr = (tx.notes || '').trim().toLowerCase()
        return `${dateStr}|${amountStr}|${notesStr}`
      })
    )

    // Check each incoming transaction against existing
    const duplicateIndices: number[] = []

    transactions.forEach((tx: {
      date?: string
      amount?: number | string
      usd_amount?: number | string
      notes?: string
    }, index: number) => {
      const dateStr = tx.date
        ? new Date(tx.date).toISOString().split('T')[0]
        : ''
      const amountVal = Number(tx.amount || tx.usd_amount || 0)
      const amountStr = amountVal.toFixed(2)
      const notesStr = (tx.notes || '').trim().toLowerCase()
      const key = `${dateStr}|${amountStr}|${notesStr}`

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
