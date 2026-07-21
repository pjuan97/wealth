'use client'

import { useState, useEffect } from 'react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useCurrencyPreference } from '@/app/components/CurrencyPreferenceProvider'

interface AccountBalance {
  name: string
  balance: number
  balanceUsd: number
  type: 'cash' | 'investment' | 'debt'
}

interface MonthlyPoint {
  month: string
  netWorth: number
  assets?: number
  liabilities?: number
}

interface BalancesData {
  accounts: AccountBalance[]
  totalAssets: number
  totalAssetsUsd: number
  totalLiabilities: number
  totalLiabilitiesUsd: number
  netWorth: number
  netWorthUsd: number
  netWorthEvolution: MonthlyPoint[]
  fxRate: number
}

const MONTH_SHORT: Record<string, string> = {
  '2026-01': 'Jan', '2026-02': 'Feb', '2026-03': 'Mar',
  '2026-04': 'Apr', '2026-05': 'May', '2026-06': 'Jun',
  '2026-07': 'Jul', '2026-08': 'Aug', '2026-09': 'Sep',
  '2026-10': 'Oct', '2026-11': 'Nov', '2026-12': 'Dec',
}

function getAccountIcon(name: string, type: string): string {
  const icons: Record<string, string> = {
    'Bancolombia (Cash)': '🏦',
    'Bancolombia Fiduciary': '📈',
    'Dollar App (Cash)': '💵',
    'Dollar App (ETFs)': '📊',
    'Credit Cards': '💳',
    'Trii': '📊',
    'Tyba': '💼',
    'Interactive Brokers': '🌐',
    'Loans': '🤝',
  }
  return icons[name] || (type === 'cash' ? '🏦' : type === 'investment' ? '📈' : '💳')
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

function formatMillionsCOP(n: number) {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  return `${(n / 1_000).toFixed(0)}K`
}

// Linear regression for trend line
function computeTrend(data: MonthlyPoint[]): MonthlyPoint[] {
  const n = data.length
  if (n < 2) return data
  const xs = data.map((_, i) => i)
  const ys = data.map(d => d.netWorth)
  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0)
  const sumXX = xs.reduce((s, x) => s + x * x, 0)
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  return data.map((d, i) => ({ ...d, trend: Math.round(intercept + slope * i) }))
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string; color: string }>
  label?: string
  formatValue: (n: number) => string
}

function CustomTooltip({ active, payload, label, formatValue }: TooltipProps) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-strong)',
      borderRadius: '10px',
      padding: '12px 16px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '8px', fontWeight: 600 }}>
        {MONTH_SHORT[label || ''] || label}
      </p>
      {payload.map((p, i) => (
        p.dataKey !== 'trend' && (
          <div key={i} style={{ marginBottom: '4px' }}>
            <p style={{ color: '#f1f5f9', fontSize: '15px', fontWeight: 700 }}>
              {formatValue(p.value)}
            </p>
          </div>
        )
      ))}
    </div>
  )
}

export default function BalancesPage() {
  const { displayCurrency, convert } = useCurrencyPreference()
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Computing balances…</span>
      </div>
    )
  }

  if (!data) return null

  const fxRate = data.fxRate
  // Every account carries a real COP figure and a real USD figure (native for
  // USD accounts, FX-derived only as a fallback) — the toggle picks which one
  // is primary, it's never a blanket division by today's rate.
  const primary = (cop: number, usd: number) => displayCurrency === 'USD' ? usd : cop
  const secondary = (cop: number, usd: number) => displayCurrency === 'USD' ? cop : usd
  const fmtPrimary = (n: number) => displayCurrency === 'USD' ? formatUSD(n) : formatCOP(n)
  const fmtSecondary = (n: number) => displayCurrency === 'USD' ? formatCOP(n) : formatUSD(n)

  // Assets = cash + investment (balance positivo)
  const assets = (data.accounts || []).filter(a =>
    (a.type === 'cash' || a.type === 'investment') && a.balance >= 0
  )

  // Liabilities = debt accounts con balance negativo
  const liabilities = (data.accounts || []).filter(a =>
    a.type === 'debt' || a.balance < 0
  )

  // The monthly evolution series only has a COP figure per month (no real
  // per-month USD split) — convert with that month's own TRM when USD is chosen.
  const chartDataRaw = (data.netWorthEvolution || []).map(p => ({
    ...p,
    netWorth: convert(p.netWorth, 'COP', p.month),
    assets: p.assets !== undefined ? convert(p.assets, 'COP', p.month) : p.assets,
    liabilities: p.liabilities !== undefined ? convert(p.liabilities, 'COP', p.month) : p.liabilities,
    displayLabel: MONTH_SHORT[p.month] || p.month,
  }))
  const chartData = computeTrend(chartDataRaw) as (MonthlyPoint & { trend?: number; displayLabel: string })[]

  const netWorthChange = chartData.length >= 2
    ? chartData[chartData.length - 1].netWorth - chartData[0].netWorth
    : 0

  const changePositive = netWorthChange >= 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflowY: 'auto' }}>

      {/* Header */}
      <div style={{
        padding: '24px 32px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Balances
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Computed from all transactions · FX {formatCOP(fxRate)}/USD
        </p>
      </div>

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Hero cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          {[
            { label: 'Net Worth', cop: data.netWorth, usd: data.netWorthUsd, primary: true },
            { label: 'Total Assets', cop: data.totalAssets, usd: data.totalAssetsUsd, primary: false },
            { label: 'Total Liabilities', cop: -data.totalLiabilities, usd: -data.totalLiabilitiesUsd, primary: false },
          ].map(card => (
            <div key={card.label} style={{
              background: card.primary ? 'var(--bg-elevated)' : 'var(--bg-surface)',
              border: `1px solid ${card.primary ? 'var(--border-strong)' : 'var(--border)'}`,
              borderRadius: '14px',
              padding: '20px 24px',
            }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                {card.label}
              </p>
              {/* Chosen display currency — large and prominent */}
              <p style={{ fontSize: '22px', fontWeight: 800, color: primary(card.cop, card.usd) >= 0 ? 'var(--text-primary)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                {fmtPrimary(primary(card.cop, card.usd))}
              </p>
              {/* Other currency — clearly visible reference */}
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '6px', fontVariantNumeric: 'tabular-nums' }}>
                {fmtSecondary(secondary(card.cop, card.usd))}
              </p>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '20px 24px',
        }}>
          {/* Chart header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Net Worth Evolution
              </p>
              {netWorthChange !== 0 && (
                <p style={{ fontSize: '13px', color: changePositive ? '#94a3b8' : '#64748b', marginTop: '4px', fontWeight: 500 }}>
                  {changePositive ? '↑' : '↓'}{' '}
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                    {fmtPrimary(Math.abs(netWorthChange))}
                  </span>
                  {' '}since January
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['netWorth', 'assets'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setChartView(v)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
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

          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 16 }}>
              <defs>
                <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.25}/>
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.02}/>
                </linearGradient>
                <linearGradient id="assetGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#cbd5e1" stopOpacity={0.2}/>
                  <stop offset="100%" stopColor="#cbd5e1" stopOpacity={0.02}/>
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="4 4"
                stroke="rgba(148,163,184,0.1)"
                vertical={false}
              />

              <XAxis
                dataKey="month"
                tickFormatter={m => MONTH_SHORT[m] || m}
                tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }}
                axisLine={{ stroke: 'rgba(148,163,184,0.2)' }}
                tickLine={false}
              />

              <YAxis
                tickFormatter={formatMillionsCOP}
                tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                width={62}
              />

              <Tooltip content={<CustomTooltip formatValue={fmtPrimary} />} />

              {chartView === 'netWorth' ? (
                <>
                  <Area
                    type="monotone"
                    dataKey="netWorth"
                    stroke="#f97316"
                    strokeWidth={2.5}
                    fill="url(#netWorthGrad)"
                    dot={{ fill: '#f97316', stroke: '#0f172a', strokeWidth: 2, r: 5 }}
                    activeDot={{ fill: '#ffffff', stroke: '#f97316', strokeWidth: 2, r: 6 }}
                    name="Net Worth"
                  />
                  {/* Trend line */}
                  <Line
                    type="linear"
                    dataKey="trend"
                    stroke="var(--text-secondary)"
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    dot={false}
                    activeDot={false}
                    name="Trend"
                  />
                </>
              ) : (
                <>
                  <Area
                    type="monotone"
                    dataKey="assets"
                    stroke="#cbd5e1"
                    strokeWidth={2.5}
                    fill="url(#assetGrad)"
                    dot={{ fill: '#cbd5e1', stroke: '#0f172a', strokeWidth: 2, r: 5 }}
                    activeDot={{ fill: '#ffffff', stroke: '#cbd5e1', strokeWidth: 2, r: 6 }}
                    name="Assets"
                  />
                  <Line
                    type="monotone"
                    dataKey="liabilities"
                    stroke="#475569"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={{ fill: '#475569', stroke: '#0f172a', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 5 }}
                    name="Liabilities"
                  />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>

          {/* Chart legend */}
          <div style={{ display: 'flex', gap: '20px', marginTop: '12px', paddingLeft: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '20px', height: '2.5px', background: '#f97316', borderRadius: '2px' }}/>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {chartView === 'netWorth' ? 'Net Worth' : 'Assets'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '20px', height: '0', borderTop: '2px dashed #64748b' }}/>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {chartView === 'netWorth' ? 'Trend' : 'Liabilities'}
              </span>
            </div>
          </div>
        </div>

        {/* Accounts grid — side by side, expands to fill space */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

          {/* Assets */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
            }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Assets</p>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtPrimary(primary(data.totalAssets, data.totalAssetsUsd))}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtSecondary(secondary(data.totalAssets, data.totalAssetsUsd))}
                </p>
              </div>
            </div>
            {assets.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No assets</p>
              </div>
            ) : (
              assets.map((a, i) => (
                <div key={a.name} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 20px',
                  borderBottom: i < assets.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '18px' }}>{getAccountIcon(a.name, a.type)}</span>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {a.name}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtSecondary(secondary(a.balance, a.balanceUsd))}
                      </p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtPrimary(primary(a.balance, a.balanceUsd))}
                    </p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                      {primary(data.totalAssets, data.totalAssetsUsd) > 0
                        ? `${((primary(a.balance, a.balanceUsd) / primary(data.totalAssets, data.totalAssetsUsd)) * 100).toFixed(1)}%`
                        : '—'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Liabilities */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
            }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Liabilities</p>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtPrimary(primary(data.totalLiabilities, data.totalLiabilitiesUsd))}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtSecondary(secondary(data.totalLiabilities, data.totalLiabilitiesUsd))}
                </p>
              </div>
            </div>
            {liabilities.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <p style={{ fontSize: '24px', marginBottom: '8px' }}>✓</p>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No liabilities</p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Credit cards are paid in full
                </p>
              </div>
            ) : (
              liabilities.map((a, i) => (
                <div key={a.name} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 20px',
                  borderBottom: i < liabilities.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '18px' }}>{getAccountIcon(a.name, a.type)}</span>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {a.name}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtSecondary(secondary(Math.abs(a.balance), Math.abs(a.balanceUsd)))}
                      </p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtPrimary(primary(Math.abs(a.balance), Math.abs(a.balanceUsd)))}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Net Worth breakdown bar */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '20px 24px',
        }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Asset Allocation
          </p>
          {/* Progress bar */}
          <div style={{
            height: '8px',
            borderRadius: '4px',
            background: 'var(--bg-elevated)',
            overflow: 'hidden',
            display: 'flex',
            marginBottom: '12px',
          }}>
            {assets.map((a, i) => {
              const pct = primary(data.totalAssets, data.totalAssetsUsd) > 0
                ? (primary(a.balance, a.balanceUsd) / primary(data.totalAssets, data.totalAssetsUsd)) * 100
                : 0
              const colors = ['#e2e8f0', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b']
              return (
                <div
                  key={a.name}
                  style={{
                    width: `${pct}%`,
                    background: colors[i % colors.length],
                    transition: 'width 0.3s ease',
                  }}
                />
              )
            })}
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px' }}>
            {assets.map((a, i) => {
              const pct = primary(data.totalAssets, data.totalAssetsUsd) > 0
                ? (primary(a.balance, a.balanceUsd) / primary(data.totalAssets, data.totalAssetsUsd)) * 100
                : 0
              const colors = ['#e2e8f0', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b']
              return (
                <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: colors[i % colors.length], flexShrink: 0 }}/>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{a.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {pct.toFixed(1)}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
