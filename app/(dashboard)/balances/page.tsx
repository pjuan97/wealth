'use client'

import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts'

interface AccountBalance {
  name: string
  balance: number
  type: 'asset' | 'liability' | 'neutral'
}

interface MonthlyPoint {
  month: string
  netWorth: number
  assets: number
  liabilities: number
}

interface BalancesData {
  accounts: AccountBalance[]
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  monthlyNetWorth: MonthlyPoint[]
  latestFxRate: number
}

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

function formatUSD(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

function formatMillions(n: number) {
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`
  }
  return `${(n / 1_000).toFixed(0)}K`
}

const MONTH_SHORT: Record<string, string> = {
  '2026-01': 'Jan', '2026-02': 'Feb', '2026-03': 'Mar',
  '2026-04': 'Apr', '2026-05': 'May', '2026-06': 'Jun',
  '2026-07': 'Jul', '2026-08': 'Aug', '2026-09': 'Sep',
  '2026-10': 'Oct', '2026-11': 'Nov', '2026-12': 'Dec',
}

const ACCOUNT_ICONS: Record<string, string> = {
  'Bancolombia (Cash)': '🏦',
  'Bancolombia Fiduciary': '📈',
  'Credit Cards': '💳',
  'Trii': '📊',
  'Tyba': '💼',
  'Dollar App': '💵',
  'Loans': '🤝',
  'Interactive Brokers': '🌐',
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; name: string }>
  label?: string
  fxRate: number
}

function CustomTooltip({ active, payload, label, fxRate }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null
  const value = payload[0]?.value || 0
  return (
    <div
      className="rounded-lg px-4 py-3 shadow-xl"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-strong)',
      }}
    >
      <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
        {MONTH_SHORT[label || ''] || label}
      </p>
      <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
        {formatCOP(value)}
      </p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
        {formatUSD(value / fxRate)}
      </p>
    </div>
  )
}

export default function BalancesPage() {
  const [data, setData] = useState<BalancesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [chartView, setChartView] = useState<'netWorth' | 'assets'>('netWorth')

  useEffect(() => {
    fetch('/api/balances')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { console.error(e); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Computing balances…
        </span>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Failed to load balances
        </span>
      </div>
    )
  }

  const fxRate = data.latestFxRate
  const assets = data.accounts.filter(a => a.type === 'asset')
  const liabilities = data.accounts.filter(a => a.type === 'liability')

  const chartData = data.monthlyNetWorth.map(p => ({
    ...p,
    month: p.month,
    displayLabel: MONTH_SHORT[p.month] || p.month,
  }))

  const netWorthChange = chartData.length >= 2
    ? chartData[chartData.length - 1].netWorth - chartData[0].netWorth
    : 0

  return (
    <div className="flex flex-col h-screen overflow-auto">

      {/* Header */}
      <div
        className="px-8 py-6 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Balances
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Account balances and net worth — computed from all transactions
        </p>
      </div>

      <div className="px-8 py-6 space-y-6">

        {/* Net Worth hero cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Net Worth', value: data.netWorth, sub: formatUSD(data.netWorth / fxRate), highlight: true },
            { label: 'Total Assets', value: data.totalAssets, sub: formatUSD(data.totalAssets / fxRate), highlight: false },
            { label: 'Total Liabilities', value: -data.totalLiabilities, sub: formatUSD(data.totalLiabilities / fxRate), highlight: false },
          ].map(card => (
            <div
              key={card.label}
              className="rounded-xl px-6 py-5"
              style={{
                background: card.highlight ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                border: card.highlight
                  ? '1px solid var(--border-strong)'
                  : '1px solid var(--border)',
              }}
            >
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                {card.label}
              </p>
              <p
                className="text-2xl font-bold tabular-nums"
                style={{
                  color: card.value >= 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {formatCOP(card.value)}
              </p>
              <p className="text-sm mt-1 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {card.sub}
              </p>
            </div>
          ))}
        </div>

        {/* Net Worth evolution chart */}
        <div
          className="rounded-xl px-6 py-5"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
          }}
        >
          {/* Chart header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Net Worth Evolution
              </h2>
              {netWorthChange !== 0 && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {netWorthChange >= 0 ? '↑' : '↓'} {formatCOP(Math.abs(netWorthChange))} since January
                </p>
              )}
            </div>
            <div className="flex gap-1">
              {(['netWorth', 'assets'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setChartView(v)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={{
                    background: chartView === v ? 'var(--bg-elevated)' : 'transparent',
                    color: chartView === v ? 'var(--text-primary)' : 'var(--text-muted)',
                    border: chartView === v ? '1px solid var(--border-strong)' : '1px solid transparent',
                  }}
                >
                  {v === 'netWorth' ? 'Net Worth' : 'Assets vs Liabilities'}
                </button>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={220}>
            {chartView === 'netWorth' ? (
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.06)" vertical={false}/>
                <XAxis
                  dataKey="month"
                  tickFormatter={m => MONTH_SHORT[m] || m}
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatMillions}
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                />
                <Tooltip content={<CustomTooltip fxRate={fxRate} />} />
                <Area
                  type="monotone"
                  dataKey="netWorth"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  fill="url(#nwGrad)"
                  dot={{ fill: '#94a3b8', strokeWidth: 0, r: 3 }}
                  activeDot={{ fill: '#f1f5f9', strokeWidth: 0, r: 4 }}
                />
              </AreaChart>
            ) : (
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="assetGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.06)" vertical={false}/>
                <XAxis
                  dataKey="month"
                  tickFormatter={m => MONTH_SHORT[m] || m}
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatMillions}
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                />
                <Tooltip content={<CustomTooltip fxRate={fxRate} />} />
                <Area
                  type="monotone"
                  dataKey="assets"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  fill="url(#assetGrad)"
                  dot={{ fill: '#94a3b8', strokeWidth: 0, r: 3 }}
                  activeDot={{ fill: '#f1f5f9', strokeWidth: 0, r: 4 }}
                  name="Assets"
                />
                <Line
                  type="monotone"
                  dataKey="liabilities"
                  stroke="#475569"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  name="Liabilities"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Account tables */}
        <div className="grid grid-cols-2 gap-4">

          {/* Assets */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Assets
              </h3>
              <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {formatCOP(data.totalAssets)}
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {assets.map(a => (
                <div key={a.name} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-base">{ACCOUNT_ICONS[a.name] || '💰'}</span>
                    <div>
                      <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {a.name}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {formatUSD(a.balance / fxRate)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {formatCOP(a.balance)}
                    </p>
                    <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {data.totalAssets > 0
                        ? `${((a.balance / data.totalAssets) * 100).toFixed(1)}%`
                        : '0%'
                      }
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Liabilities */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Liabilities
              </h3>
              <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {formatCOP(data.totalLiabilities)}
              </span>
            </div>
            {liabilities.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  No liabilities
                </p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {liabilities.map(a => (
                  <div key={a.name} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-base">{ACCOUNT_ICONS[a.name] || '💰'}</span>
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {a.name}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {formatUSD(Math.abs(a.balance) / fxRate)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {formatCOP(Math.abs(a.balance))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
