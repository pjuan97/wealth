import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ message: 'Transactions API — coming in WEALTH-004' })
}
