import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'
import { VALID_PLAN_MONTHS } from '@/lib/planService'

function csvEscape(value: string): string {
  return value.includes(',') || value.includes('"') || value.includes('\n')
    ? `"${value.replace(/"/g, '""')}"`
    : value
}

// GET /api/plan/export - full annual plan structure (all categories x all months) as CSV,
// so the user can fill it in a spreadsheet and re-import it.
export async function GET(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.id

  try {
    const [categories, plans] = await Promise.all([
      prisma.categoryDef.findMany({
        where: { user_id: userId, level_1: { in: ['Income', 'Expense'] }, is_active: true },
        orderBy: [{ level_1: 'asc' }, { level_2: 'asc' }, { level_3: 'asc' }],
      }),
      prisma.planVsAchievement.findMany({ where: { user_id: userId } }),
    ])

    const planMap = new Map<string, number>(
      plans.map(p => [`${p.month_label}||${p.event_type}||${p.level_2}||${p.level_3 || ''}`, Number(p.plan)])
    )
    // A category's currency is assumed consistent across months — take it from any existing row.
    const currencyMap = new Map<string, string>()
    for (const p of plans) {
      const catKey = `${p.event_type}||${p.level_2}||${p.level_3 || ''}`
      if (!currencyMap.has(catKey)) currencyMap.set(catKey, p.currency)
    }

    const lines = ['month_label,event_type,level_2,level_3,plan,currency']
    for (const month of VALID_PLAN_MONTHS) {
      for (const cat of categories) {
        const catKey = `${cat.level_1}||${cat.level_2}||${cat.level_3 || ''}`
        const key = `${month}||${catKey}`
        const plan = planMap.get(key) ?? 0
        const currency = currencyMap.get(catKey) ?? 'COP'
        lines.push([
          month,
          cat.level_1,
          csvEscape(cat.level_2),
          cat.level_3 ? csvEscape(cat.level_3) : '',
          plan,
          currency,
        ].join(','))
      }
    }

    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="plan_structure_2026.csv"',
      },
    })
  } catch (error) {
    console.error('GET /api/plan/export error:', error)
    return NextResponse.json({ error: 'Failed to export plan' }, { status: 500 })
  }
}
