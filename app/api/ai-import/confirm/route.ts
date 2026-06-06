import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'

// Get FX rate for a given date from DailyFxRate table
async function getRateForDate(date: Date): Promise<number | null> {
  const exact = await prisma.dailyFxRate.findFirst({
    where: { date, currency: 'USD' },
  })
  if (exact) return Number(exact.rate_to_cop)

  const closest = await prisma.dailyFxRate.findFirst({
    where: { currency: 'USD', date: { lte: date } },
    orderBy: { date: 'desc' },
  })
  if (closest) return Number(closest.rate_to_cop)

  const monthLabel = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  const monthly = await prisma.fxRate.findFirst({
    where: { month_label: monthLabel, currency: 'USD' },
  })
  if (monthly) return Number(monthly.rate_to_cop)

  return null
}

export async function POST(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.id

  try {
    const body = await request.json()
    const { transactions } = body

    if (!transactions?.length) {
      return NextResponse.json({ error: 'No transactions to import' }, { status: 400 })
    }

    let imported = 0
    const errors: string[] = []

    for (const tx of transactions) {
      try {
        const txDate = new Date(tx.date)
        const monthLabel = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`

        let fxRate = tx.fx_rate ? parseFloat(tx.fx_rate) : null
        if (!fxRate) {
          fxRate = await getRateForDate(txDate)
        }

        let amount = tx.amount ? parseFloat(String(tx.amount)) : null
        const usdAmount = tx.usd_amount ? parseFloat(String(tx.usd_amount)) : null
        if (!amount && usdAmount && fxRate) {
          amount = Math.round(usdAmount * fxRate)
        }

        if (!amount || amount <= 0) {
          errors.push(`Skipped: invalid amount for ${tx.notes || tx.date}`)
          continue
        }

        await prisma.transaction.create({
          data: {
            user_id: userId,
            date: txDate,
            month_label: monthLabel,
            event_type: tx.event_type || 'Expense',
            level_1: tx.level_1 || 'Expense',
            level_2: tx.level_2 || 'Others',
            level_3: tx.level_3 || null,
            usd_amount: usdAmount,
            fx_rate: fxRate,
            amount,
            from_account: tx.from_account || null,
            to_account: tx.to_account || null,
            notes: tx.notes || null,
          },
        })
        imported++
      } catch (err) {
        errors.push(`Error: ${err instanceof Error ? err.message : 'Unknown'} for ${tx.notes || tx.date}`)
      }
    }

    return NextResponse.json({ imported, errors, total: transactions.length })
  } catch (error) {
    console.error('AI Import confirm error:', error)
    return NextResponse.json({ error: 'Failed to import' }, { status: 500 })
  }
}
