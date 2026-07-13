import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const accounts = await prisma.accountDef.findMany({
      where: {
        user_id: session.id,
        is_active: true,
        import_enabled: true,
      },
      select: {
        id: true,
        name: true,
        type: true,
        statement_currency: true,
        sign_logic: true,
        default_counterparty: true,
        context_notes: true,
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ accounts })
  } catch (error) {
    console.error('GET /api/ai-import/accounts error:', error)
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  }
}
