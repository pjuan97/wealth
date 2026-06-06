import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getRateForDate } from '@/lib/fxService'
import { verifyRequestSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.id

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  const cursor = searchParams.get('cursor')
  const limit = 50

  try {
    const where = {
      user_id: userId,
      ...(month ? { month_label: month } : {}),
    }

    const [transactions, fxRate] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: parseInt(cursor) }, skip: 1 } : {}),
      }),
      month
        ? prisma.fxRate.findFirst({ where: { month_label: month, currency: 'USD' } })
        : Promise.resolve(null),
    ])

    const hasMore = transactions.length > limit
    const data = hasMore ? transactions.slice(0, limit) : transactions
    const nextCursor = hasMore ? data[data.length - 1].id : null

    return NextResponse.json({
      data,
      nextCursor,
      hasMore,
      fxRate: fxRate ? Number(fxRate.rate_to_cop) : null,
    })
  } catch (error) {
    console.error('GET /api/transactions error:', error)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.id

  try {
    const body = await request.json()

    // Get TRM for the transaction date
    const txDate = new Date(body.date)
    let fxRate = body.fx_rate ? parseFloat(body.fx_rate) : null

    // Auto-fetch daily TRM if not provided
    if (!fxRate) {
      const dailyRate = await getRateForDate(txDate)
      if (dailyRate) fxRate = dailyRate
    }

    // Auto-calculate COP amount from USD if needed
    let amount = body.amount ? parseFloat(body.amount) : null
    const usdAmount = body.usd_amount ? parseFloat(body.usd_amount) : null

    if (!amount && usdAmount && fxRate) {
      amount = Math.round(usdAmount * fxRate)
    }

    if (!amount) {
      return NextResponse.json({ error: 'Amount required' }, { status: 400 })
    }

    // Derive month_label from date
    const monthLabel = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`

    const transaction = await prisma.transaction.create({
      data: {
        user_id: userId,
        date: txDate,
        month_label: body.month_label || monthLabel,
        event_type: body.event_type,
        level_1: body.level_1,
        level_2: body.level_2,
        level_3: body.level_3 || null,
        usd_amount: usdAmount,
        fx_rate: fxRate,
        amount,
        from_account: body.from_account || null,
        to_account: body.to_account || null,
        notes: body.notes || null,
      },
    })

    return NextResponse.json(transaction, { status: 201 })
  } catch (error) {
    console.error('POST /api/transactions error:', error)
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const { id, ...fields } = body

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    // Whitelist of editable fields
    const allowed = ['event_type', 'level_1', 'level_2', 'level_3', 'from_account', 'to_account', 'notes', 'amount', 'usd_amount']
    const updateData: Record<string, string | number | null> = {}
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updateData[key] = fields[key] === '' ? null : fields[key]
      }
    }

    // Recalculate level_1 from level_2 if level_2 changes
    if (updateData.level_2) {
      const l2 = updateData.level_2 as string
      if (['Salary', 'Other Incomes'].includes(l2)) updateData.level_1 = 'Income'
      else if (['Life', 'Health', 'Travels', 'Others'].includes(l2)) updateData.level_1 = 'Expense'
      else if (['Credit Cards', 'Loans'].includes(l2)) updateData.level_1 = 'Debt'
      else if (['Fiduciary', 'ETFs', 'Collective Investment Funds', 'Companies', 'Bank (Cash)'].includes(l2)) updateData.level_1 = 'Equity'
      else if (l2 === 'Financial Movement') updateData.level_1 = 'Financial Movement'
    }

    const updated = await prisma.transaction.update({
      where: { id: parseInt(String(id)), user_id: session.id },
      data: updateData,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/transactions error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.id

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
  try {
    // Verify ownership before deleting
    const tx = await prisma.transaction.findFirst({ where: { id: parseInt(id), user_id: userId } })
    if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.transaction.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/transactions error:', error)
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 })
  }
}
