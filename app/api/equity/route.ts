import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRequestSession } from '@/lib/auth'

// Monthly rate from annual: (1 + annual)^(1/12) - 1
function annualToMonthly(annual: number): number {
  return Math.pow(1 + annual, 1 / 12) - 1
}

// Get net flow from transactions for a given account + month
async function getNetFlow(account: string, monthLabel: string, userId: number): Promise<number> {
  // Get ALL transactions that involve this account in any direction
  const txs = await prisma.transaction.findMany({
    where: {
      user_id: userId,
      month_label: monthLabel,
      OR: [
        { to_account: account },
        { from_account: account },
      ],
      // Exclude Opening_Balance
      event_type: {
        notIn: ['Opening_Balance'],
      },
    },
    select: {
      event_type: true,
      amount: true,
      usd_amount: true,
      to_account: true,
      from_account: true,
      fx_rate: true,
    },
  })

  let net = 0
  for (const tx of txs) {
    const amount = Number(tx.amount) || 0

    if (tx.to_account === account) {
      // Money flowing INTO the account
      net += amount
    } else if (tx.from_account === account) {
      // Money flowing OUT of the account
      net -= amount
    }
  }
  return net
}

// Get start balance for a month: Cierre Real of previous month, else base_equity
async function getStartBalance(
  account: string,
  monthLabel: string,
  baseEquity: number,
  userId: number
): Promise<number> {
  const [year, month] = monthLabel.split('-').map(Number)
  const prevMonth = month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, '0')}`

  const prev = await prisma.equityExecuted.findFirst({
    where: { user_id: userId, platform: account, month_label: prevMonth },
  })

  if (prev?.market_value_end) return Number(prev.market_value_end)
  return baseEquity
}

export async function GET(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.id

  const { searchParams } = new URL(request.url)
  const view = searchParams.get('view')
  const month = searchParams.get('month')

  try {
    if (view === 'annual') {
      const [forecasts, executed] = await Promise.all([
        prisma.equityForecast.findMany({
          where: { user_id: userId },
          orderBy: [{ month_label: 'asc' }, { account: 'asc' }],
        }),
        prisma.equityExecuted.findMany({
          where: { user_id: userId },
          orderBy: [{ month_label: 'asc' }, { platform: 'asc' }],
        }),
      ])

      const months = [...new Set(forecasts.map(f => f.month_label))].sort()
      const accounts = [...new Set(forecasts.map(f => f.account))].sort()

      const matrix = await Promise.all(accounts.map(async account => {
        const monthData = await Promise.all(months.map(async m => {
          const forecast = forecasts.find(f => f.account === account && f.month_label === m)
          const exec = executed.find(e => e.platform === account && e.month_label === m)

          if (!forecast) return { month: m, projected_end: null, market_value_end: null, market_variance: null, start_balance: null, expected_end: null }

          const annual_rate = Number(forecast.annual_rate)
          const monthly_rate = annualToMonthly(annual_rate)
          const start_balance = await getStartBalance(account, m, Number(forecast.base_equity), userId)
          const net_flow = await getNetFlow(account, m, userId)
          const expected_end = Math.round(start_balance * (1 + monthly_rate) + net_flow)
          const market_value_end = exec?.market_value_end ? Number(exec.market_value_end) : null
          const market_variance = market_value_end !== null ? market_value_end - expected_end : null

          return {
            month: m,
            projected_end: expected_end,
            market_value_end,
            market_variance,
            start_balance,
            expected_end,
          }
        }))

        return {
          account,
          equity_type: forecasts.find(f => f.account === account)?.equity_type || '',
          months: monthData,
        }
      }))

      const portfolioByMonth = months.map(m => {
        const projected = matrix.reduce((s, a) => {
          const md = a.months.find(x => x.month === m)
          return s + (md?.projected_end || 0)
        }, 0)
        const hasExecuted = matrix.some(a => {
          const md = a.months.find(x => x.month === m)
          return md?.market_value_end !== null
        })
        const market_value = hasExecuted
          ? matrix.reduce((s, a) => {
              const md = a.months.find(x => x.month === m)
              return s + (md?.market_value_end || 0)
            }, 0)
          : null

        return { month: m, projected, market_value }
      })

      return NextResponse.json({ matrix, months, portfolioByMonth })
    }

    // MONTHLY VIEW
    const targetMonth = month || '2026-04'
    const [forecasts, executed] = await Promise.all([
      prisma.equityForecast.findMany({
        where: { user_id: userId, month_label: targetMonth },
        orderBy: { account: 'asc' },
      }),
      prisma.equityExecuted.findMany({
        where: { user_id: userId, month_label: targetMonth },
        orderBy: { platform: 'asc' },
      }),
    ])

    const rows = await Promise.all(forecasts.map(async f => {
      const exec = executed.find(e => e.platform === f.account)
      const annual_rate = Number(f.annual_rate)
      const monthly_rate = annualToMonthly(annual_rate)
      const start_balance = await getStartBalance(f.account, targetMonth, Number(f.base_equity), userId)
      const net_flow = await getNetFlow(f.account, targetMonth, userId)
      const expected_end = Math.round(start_balance * (1 + monthly_rate) + net_flow)
      // If manual value exists, use it; otherwise estimate from formula
      const manual_value = exec?.market_value_end
        ? Number(exec.market_value_end)
        : null

      const estimated_value = manual_value === null
        ? Math.round(start_balance * (1 + monthly_rate) + net_flow)
        : null

      const market_value_end = manual_value ?? estimated_value
      const is_estimated = manual_value === null
      const market_variance = market_value_end !== null ? market_value_end - expected_end : null
      const return_pct = start_balance > 0 ? ((expected_end - start_balance) / start_balance) * 100 : 0

      return {
        id: f.id,
        exec_id: exec?.id || null,
        account: f.account,
        equity_type: f.equity_type,
        annual_rate,
        monthly_rate,
        start_balance,
        net_flow,
        expected_end,
        market_value_end,
        is_estimated,
        market_variance,
        return_pct,
      }
    }))

    const totals = {
      start_balance: rows.reduce((s, r) => s + r.start_balance, 0),
      expected_end: rows.reduce((s, r) => s + r.expected_end, 0),
      market_value_end: rows.some(r => r.market_value_end !== null)
        ? rows.reduce((s, r) => s + (r.market_value_end || 0), 0)
        : null,
      market_variance: rows.some(r => r.market_variance !== null)
        ? rows.reduce((s, r) => s + (r.market_variance || 0), 0)
        : null,
    }

    return NextResponse.json({ rows, totals, month: targetMonth })
  } catch (error) {
    console.error('GET /api/equity error:', error)
    return NextResponse.json({ error: 'Failed to fetch equity data' }, { status: 500 })
  }
}

// PATCH - update market_value_end OR annual_rate OR start_balance (Jan only)
export async function PATCH(request: NextRequest) {
  const session = await verifyRequestSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.id

  try {
    const body = await request.json()
    const { exec_id, forecast_id, market_value_end, annual_rate, base_equity } = body

    // Update Cierre Real
    if (exec_id !== undefined && market_value_end !== undefined) {
      // Verify ownership
      const existing = await prisma.equityExecuted.findFirst({ where: { id: exec_id, user_id: userId } })
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const updated = await prisma.equityExecuted.update({
        where: { id: exec_id },
        data: { market_value_end: market_value_end !== null ? parseFloat(market_value_end) : null },
      })
      return NextResponse.json(updated)
    }

    // Update annual rate on forecast
    if (forecast_id !== undefined && annual_rate !== undefined) {
      const existing = await prisma.equityForecast.findFirst({ where: { id: forecast_id, user_id: userId } })
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const newMonthly = Math.pow(1 + parseFloat(annual_rate), 1 / 12) - 1
      const updated = await prisma.equityForecast.update({
        where: { id: forecast_id },
        data: {
          annual_rate: parseFloat(annual_rate),
          monthly_rate: newMonthly,
        },
      })
      return NextResponse.json(updated)
    }

    // Update base_equity (start balance for Jan)
    if (forecast_id !== undefined && base_equity !== undefined) {
      const existing = await prisma.equityForecast.findFirst({ where: { id: forecast_id, user_id: userId } })
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const updated = await prisma.equityForecast.update({
        where: { id: forecast_id },
        data: { base_equity: parseFloat(base_equity) },
      })
      return NextResponse.json(updated)
    }

    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  } catch (error) {
    console.error('PATCH /api/equity error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
