import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'
import { VALID_PLAN_MONTHS, upsertPlanRow } from '@/lib/planService'

interface ImportRow {
  month_label?: string
  event_type?: string
  level_2?: string
  level_3?: string | null
  plan?: string | number
}

// POST /api/plan/import - bulk create/update plan rows from a parsed CSV.
// Body: { rows: ImportRow[] } — the client parses the CSV and posts structured rows.
export async function POST(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.id

  try {
    const body = await request.json()
    const rows: ImportRow[] = body.rows

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
    }

    // Preload the user's category catalog once for mismatch validation.
    const categories = await prisma.categoryDef.findMany({
      where: { user_id: userId, level_1: { in: ['Income', 'Expense'] } },
    })
    const catKey = (l1: string, l2: string, l3: string | null) => `${l1}||${l2}||${l3 || ''}`
    const catSet = new Set(categories.map(c => catKey(c.level_1, c.level_2, c.level_3)))

    let updated = 0
    const errors: string[] = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const rowNum = i + 2 // +1 for header row, +1 for 1-indexing
      const month = (r.month_label || '').trim()
      const eventType = (r.event_type || '').trim()
      const level2 = (r.level_2 || '').trim()
      const level3 = (r.level_3 || '').trim() || null
      const planNum = Number(r.plan)

      if (!VALID_PLAN_MONTHS.includes(month)) {
        errors.push(`Row ${rowNum}: invalid month "${month}"`)
        continue
      }
      if (!['Income', 'Expense'].includes(eventType)) {
        errors.push(`Row ${rowNum}: invalid event_type "${eventType}"`)
        continue
      }
      if (!level2) {
        errors.push(`Row ${rowNum}: level_2 is required`)
        continue
      }
      if (!Number.isFinite(planNum) || planNum < 0) {
        errors.push(`Row ${rowNum}: invalid plan amount`)
        continue
      }
      if (!catSet.has(catKey(eventType, level2, level3))) {
        errors.push(`Row ${rowNum}: "${eventType} / ${level2}${level3 ? ' / ' + level3 : ''}" is not defined in Data Source`)
        continue
      }

      await upsertPlanRow(userId, month, eventType, level2, level3, planNum)
      updated++
    }

    return NextResponse.json({ updated, skipped: rows.length - updated, errors })
  } catch (error) {
    console.error('POST /api/plan/import error:', error)
    return NextResponse.json({ error: 'Failed to import plan' }, { status: 500 })
  }
}
