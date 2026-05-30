import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const rates = await prisma.fxRate.findMany({
      orderBy: { month_label: 'asc' },
    })
    return NextResponse.json(rates)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch FX rates' }, { status: 500 })
  }
}
