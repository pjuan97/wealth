import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ message: 'Balances API — coming in WEALTH-005' })
}
