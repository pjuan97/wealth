import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const view = searchParams.get('view') // 'monthly' | 'annual'
  const month = searchParams.get('month')

  try {
    if (view === 'annual') {
      const [forecasts, executed] = await Promise.all([
        prisma.equityForecast.findMany({ orderBy: [{ month_label: 'asc' }, { account: 'asc' }] }),
        prisma.equityExecuted.findMany({ orderBy: [{ month_label: 'asc' }, { platform: 'asc' }] }),
      ])

      // Get distinct months and accounts
      const months = [...new Set(forecasts.map(f => f.month_label))].sort()
      const accounts = [...new Set(forecasts.map(f => f.account))].sort()

      // Build matrix: account × month
      const matrix = accounts.map(account => {
        const monthData = months.map(m => {
          const forecast = forecasts.find(f => f.account === account && f.month_label === m)
          const exec = executed.find(e => e.platform === account && e.month_label === m)

          const projected_end = forecast ? Number(forecast.projected_end) : null
          const market_value_end = exec?.market_value_end ? Number(exec.market_value_end) : null
          const start_balance = exec ? Number(exec.start_balance) : null
          const monthly_rate = forecast ? Number(forecast.monthly_rate) : 0
          const planned_contribution = forecast ? Number(forecast.planned_contribution) : 0
          const planned_withdrawal = forecast ? Number(forecast.planned_withdrawal) : 0

          // Expected end = start * (1 + rate) + contributions - withdrawals
          const expected_end = start_balance !== null
            ? Math.round(start_balance * (1 + monthly_rate) + planned_contribution - planned_withdrawal)
            : null

          const market_variance = (market_value_end !== null && expected_end !== null)
            ? market_value_end - expected_end
            : null

          return {
            month: m,
            projected_end,
            start_balance,
            expected_end,
            market_value_end,
            market_variance,
            planned_contribution,
            planned_withdrawal,
          }
        })
        return {
          account,
          equity_type: forecasts.find(f => f.account === account)?.equity_type || '',
          months: monthData,
        }
      })

      // Portfolio totals by month
      const portfolioByMonth = months.map(m => {
        const projected = matrix.reduce((s, a) => {
          const md = a.months.find(x => x.month === m)
          return s + (md?.projected_end || 0)
        }, 0)
        const market_value = matrix.reduce((s, a) => {
          const md = a.months.find(x => x.month === m)
          return md?.market_value_end !== null ? s + (md?.market_value_end || 0) : s
        }, 0)
        const hasExecuted = matrix.some(a => {
          const md = a.months.find(x => x.month === m)
          return md?.market_value_end !== null
        })
        return { month: m, projected, market_value: hasExecuted ? market_value : null }
      })

      return NextResponse.json({ matrix, months, portfolioByMonth })
    }

    // Monthly view
    const targetMonth = month || '2026-04'
    const [forecasts, executed] = await Promise.all([
      prisma.equityForecast.findMany({
        where: { month_label: targetMonth },
        orderBy: { account: 'asc' },
      }),
      prisma.equityExecuted.findMany({
        where: { month_label: targetMonth },
        orderBy: { platform: 'asc' },
      }),
    ])

    const rows = forecasts.map(f => {
      const exec = executed.find(e => e.platform === f.account)
      const start_balance = exec ? Number(exec.start_balance) : Number(f.base_equity)
      const monthly_rate = Number(f.monthly_rate)
      const planned_contribution = Number(f.planned_contribution)
      const planned_withdrawal = Number(f.planned_withdrawal)
      const projected_end = Number(f.projected_end)
      const market_value_end = exec?.market_value_end ? Number(exec.market_value_end) : null

      const expected_end = Math.round(
        start_balance * (1 + monthly_rate) + planned_contribution - planned_withdrawal
      )
      const market_variance = market_value_end !== null ? market_value_end - expected_end : null
      const net_flow = planned_contribution - planned_withdrawal
      const return_pct = start_balance > 0
        ? ((expected_end - start_balance) / start_balance) * 100
        : 0

      return {
        id: f.id,
        exec_id: exec?.id || null,
        account: f.account,
        equity_type: f.equity_type,
        annual_rate: Number(f.annual_rate),
        monthly_rate,
        start_balance,
        planned_contribution,
        planned_withdrawal,
        net_flow,
        projected_end,
        expected_end,
        market_value_end,
        market_variance,
        return_pct,
      }
    })

    // Portfolio totals
    const totals = {
      start_balance: rows.reduce((s, r) => s + r.start_balance, 0),
      projected_end: rows.reduce((s, r) => s + r.projected_end, 0),
      expected_end: rows.reduce((s, r) => s + r.expected_end, 0),
      market_value_end: rows.every(r => r.market_value_end !== null)
        ? rows.reduce((s, r) => s + (r.market_value_end || 0), 0)
        : null,
      market_variance: rows.every(r => r.market_variance !== null)
        ? rows.reduce((s, r) => s + (r.market_variance || 0), 0)
        : null,
    }

    return NextResponse.json({ rows, totals, month: targetMonth })
  } catch (error) {
    console.error('GET /api/equity error:', error)
    return NextResponse.json({ error: 'Failed to fetch equity data' }, { status: 500 })
  }
}

// PATCH — update market_value_end (the only manual input)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { exec_id, market_value_end } = body

    if (!exec_id) return NextResponse.json({ error: 'exec_id required' }, { status: 400 })

    const updated = await prisma.equityExecuted.update({
      where: { id: exec_id },
      data: { market_value_end: market_value_end ? parseFloat(market_value_end) : null },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/equity error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
