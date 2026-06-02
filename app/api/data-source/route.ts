import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const [accounts, categories, eventTypes] = await Promise.all([
      prisma.accountDef.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }] }),
      prisma.categoryDef.findMany({ orderBy: [{ level_1: 'asc' }, { level_2: 'asc' }, { level_3: 'asc' }] }),
      prisma.eventTypeDef.findMany({ orderBy: { name: 'asc' } }),
    ])
    return NextResponse.json({ accounts, categories, eventTypes })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, data } = body

    if (type === 'account') {
      const created = await prisma.accountDef.create({ data })
      return NextResponse.json(created, { status: 201 })
    }
    if (type === 'category') {
      const created = await prisma.categoryDef.create({ data })
      return NextResponse.json(created, { status: 201 })
    }
    if (type === 'eventType') {
      const created = await prisma.eventTypeDef.create({ data: { name: data.name } })
      return NextResponse.json(created, { status: 201 })
    }
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, id, data, propagate, oldName, newName } = body

    if (type === 'account') {
      const updated = await prisma.accountDef.update({ where: { id }, data })

      if (propagate && oldName && newName) {
        const [txFrom, txTo, equityExec, equityForecast] = await Promise.all([
          prisma.transaction.updateMany({
            where: { from_account: oldName },
            data: { from_account: newName },
          }),
          prisma.transaction.updateMany({
            where: { to_account: oldName },
            data: { to_account: newName },
          }),
          prisma.equityExecuted.updateMany({
            where: { platform: oldName },
            data: { platform: newName },
          }),
          prisma.equityForecast.updateMany({
            where: { account: oldName },
            data: { account: newName },
          }),
        ])
        return NextResponse.json({
          updated,
          propagated: {
            transactions_from: txFrom.count,
            transactions_to: txTo.count,
            equity_executed: equityExec.count,
            equity_forecast: equityForecast.count,
          },
        })
      }
      return NextResponse.json(updated)
    }

    if (type === 'category') {
      const updated = await prisma.categoryDef.update({ where: { id }, data })

      if (propagate) {
        const updates: Promise<unknown>[] = []
        if (data.level_2 && oldName?.level_2 !== data.level_2) {
          updates.push(
            prisma.transaction.updateMany({
              where: { level_2: oldName.level_2 },
              data: { level_2: data.level_2 },
            })
          )
        }
        if (data.level_3 && oldName?.level_3 !== data.level_3) {
          updates.push(
            prisma.transaction.updateMany({
              where: { level_3: oldName.level_3 },
              data: { level_3: data.level_3 },
            })
          )
        }
        await Promise.all(updates)
      }
      return NextResponse.json(updated)
    }

    if (type === 'eventType') {
      const current = await prisma.eventTypeDef.findUnique({ where: { id } })
      if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const updated = await prisma.eventTypeDef.update({ where: { id }, data })

      // Propagate rename to Transaction table if name changed
      if (data.name && data.name !== current.name) {
        const propagated = await prisma.transaction.updateMany({
          where: { event_type: current.name },
          data: { event_type: data.name },
        })
        return NextResponse.json({
          updated,
          propagated: { transactions: propagated.count },
        })
      }

      return NextResponse.json(updated)
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const id = parseInt(searchParams.get('id') || '0')

    if (!type || !id) {
      return NextResponse.json({ error: 'type and id required' }, { status: 400 })
    }

    if (type === 'account') {
      const account = await prisma.accountDef.findUnique({ where: { id } })
      if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const usageCount = await prisma.transaction.count({
        where: {
          OR: [
            { from_account: account.name },
            { to_account: account.name },
          ],
        },
      })

      if (usageCount > 0) {
        return NextResponse.json({
          error: `Cannot delete — used in ${usageCount} transactions`,
          usageCount,
        }, { status: 409 })
      }

      await prisma.accountDef.delete({ where: { id } })
      return NextResponse.json({ success: true })
    }

    if (type === 'category') {
      const cat = await prisma.categoryDef.findUnique({ where: { id } })
      if (!cat) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const usageCount = await prisma.transaction.count({
        where: { level_2: cat.level_2, level_3: cat.level_3 ?? undefined },
      })

      if (usageCount > 0) {
        return NextResponse.json({
          error: `Cannot delete — used in ${usageCount} transactions`,
          usageCount,
        }, { status: 409 })
      }

      await prisma.categoryDef.delete({ where: { id } })
      return NextResponse.json({ success: true })
    }

    if (type === 'eventType') {
      await prisma.eventTypeDef.delete({ where: { id } })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
