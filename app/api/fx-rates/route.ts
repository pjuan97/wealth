import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ message: 'FX Rates API — coming in WEALTH-006' })
}
