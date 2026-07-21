'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface EquityRow {
  id: number
  exec_id: number | null
  account: string
  equity_type: string
  annual_rate: number
  monthly_rate: number
  start_balance: number
  net_flow: number
  expected_end: number
  market_value_end: number | null
  is_estimated: boolean
  market_variance: number | null
  return_pct: number
}

interface PortfolioTotals {
  start_balance: number
  expected_end: number
  market_value_end: number | null
  market_variance: number | null
}

interface AnnualMatrixRow {
  account: string
  equity_type: string
  months: {
    month: string
    projected_end: number | null
    market_value_end: number | null
    market_variance: number | null
    start_balance: number | null
    expected_end: number | null
  }[]
}

interface PortfolioMonthPoint {
  month: string
  projected: number
  market_value: number | null
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = [
  { key: '2026-01', label: 'January' },
  { key: '2026-02', label: 'February' },
  { key: '2026-03', label: 'March' },
  { key: '2026-04', label: 'April' },
  { key: '2026-05', label: 'May' },
  { key: '2026-06', label: 'June' },
  { key: '2026-07', label: 'July' },
  { key: '2026-08', label: 'August' },
  { key: '2026-09', label: 'September' },
  { key: '2026-10', label: 'October' },
  { key: '2026-11', label: 'November' },
  { key: '2026-12', label: 'December' },
]

function getCurrentMonth(): string {
  const todayKey = new Date().toISOString().slice(0, 7)
  const keys = MONTHS.map(m => m.key)
  if (keys.includes(todayKey)) return todayKey
  return todayKey < keys[0] ? keys[0] : keys[keys.length - 1]
}

const MONTH_SHORT: Record<string, string> = {
  '2026-01': 'Jan', '2026-02': 'Feb', '2026-03': 'Mar',
  '2026-04': 'Apr', '2026-05': 'May', '2026-06': 'Jun',
  '2026-07': 'Jul', '2026-08': 'Aug', '2026-09': 'Sep',
  '2026-10': 'Oct', '2026-11': 'Nov', '2026-12': 'Dec',
}

const ACCOUNT_ICONS: Record<string, string> = {
  'Bancolombia Fiduciary': '📈',
  'Trii': '📊',
  'Dollar App': '💵',
  'Tyba': '💼',
  'Interactive Brokers': '🌐',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

function formatPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

// ─── Editable market value cell ───────────────────────────────────────────────
function EditableMarketValue({
  value,
  onSave,
}: {
  value: number | null
  onSave: (v: number | null) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')
  const [saving, setSaving] = useState(false)

  const handleDoubleClick = () => {
    setRaw(value !== null ? String(Math.round(value)) : '')
    setEditing(true)
  }

  const handleSave = async () => {
    const cleaned = raw.replace(/[^0-9.]/g, '')
    const num = cleaned === '' ? null : parseFloat(cleaned)
    setSaving(true)
    await onSave(num)
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={raw}
        onChange={e => setRaw(e.target.value)}
        onBlur={handleSave}
        onKeyDown={e => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') setEditing(false)
        }}
        style={{
          width: '130px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: '6px',
          padding: '4px 8px',
          color: 'var(--text-primary)',
          fontSize: '12px',
          fontVariantNumeric: 'tabular-nums',
          outline: 'none',
          textAlign: 'right',
        }}
      />
    )
  }

  return (
    <span
      onDoubleClick={handleDoubleClick}
      title="Double-click to enter closing balance"
      style={{
        cursor: 'text',
        fontSize: '12px',
        color: 'var(--text-primary)',
        fontVariantNumeric: 'tabular-nums',
        borderBottom: '1px dashed var(--border-strong)',
        paddingBottom: '1px',
        opacity: saving ? 0.5 : 1,
      }}
    >
      {value !== null ? formatCOP(value) : <span style={{ color: 'var(--accent)', fontSize: '11px' }}>— enter value</span>}
    </span>
  )
}

// ─── Editable Annual Rate ─────────────────────────────────────────────────────
function EditableRate({
  value,
  onSave,
}: {
  value: number
  onSave: (v: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const num = parseFloat(raw.replace(/[^0-9.]/g, ''))
    if (isNaN(num) || num <= 0 || num > 100) { setEditing(false); return }
    setSaving(true)
    await onSave(num / 100) // store as decimal
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={raw}
        onChange={e => setRaw(e.target.value)}
        onBlur={handleSave}
        onKeyDown={e => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') setEditing(false)
        }}
        placeholder="10.0"
        style={{
          width: '60px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: '6px',
          padding: '4px 8px',
          color: 'var(--text-primary)',
          fontSize: '11px',
          outline: 'none',
          textAlign: 'right',
        }}
      />
    )
  }

  return (
    <span
      onDoubleClick={() => { setRaw((value * 100).toFixed(1)); setEditing(true) }}
      title="Double-click to edit annual rate"
      style={{
        cursor: 'text',
        fontSize: '11px',
        color: 'var(--text-primary)',
        borderBottom: '1px dashed var(--border-strong)',
        paddingBottom: '1px',
        opacity: saving ? 0.5 : 1,
      }}
    >
      {(value * 100).toFixed(1)}%
    </span>
  )
}

// ─── Editable Start Balance ──────────────────────────────────────────────────
function EditableStartBalance({
  value,
  editable,
  onSave,
}: {
  value: number
  editable: boolean
  onSave: (v: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')
  const [saving, setSaving] = useState(false)

  if (!editable) {
    return (
      <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {formatCOP(value)}
      </span>
    )
  }

  const handleSave = async () => {
    const num = parseFloat(raw.replace(/[^0-9.]/g, ''))
    if (isNaN(num)) { setEditing(false); return }
    setSaving(true)
    await onSave(num)
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={raw}
        onChange={e => setRaw(e.target.value)}
        onBlur={handleSave}
        onKeyDown={e => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') setEditing(false)
        }}
        style={{
          width: '130px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: '6px',
          padding: '4px 8px',
          color: 'var(--text-primary)',
          fontSize: '12px',
          fontVariantNumeric: 'tabular-nums',
          outline: 'none',
          textAlign: 'right',
        }}
      />
    )
  }

  return (
    <span
      onDoubleClick={() => { setRaw(String(Math.round(value))); setEditing(true) }}
      title="Double-click to edit start balance"
      style={{
        cursor: 'text',
        fontSize: '12px',
        color: 'var(--text-primary)',
        fontVariantNumeric: 'tabular-nums',
        borderBottom: '1px dashed var(--border-strong)',
        paddingBottom: '1px',
        opacity: saving ? 0.5 : 1,
      }}
    >
      {formatCOP(value)}
    </span>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function EquityForecastPage() {
  const [tab, setTab] = useState<'monthly' | 'annual'>('monthly')
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth)

  // Monthly state
  const [rows, setRows] = useState<EquityRow[]>([])
  const [totals, setTotals] = useState<PortfolioTotals | null>(null)
  const [loadingMonthly, setLoadingMonthly] = useState(false)

  // Annual state
  const [matrix, setMatrix] = useState<AnnualMatrixRow[]>([])
  const [annualMonths, setAnnualMonths] = useState<string[]>([])
  const [portfolioByMonth, setPortfolioByMonth] = useState<PortfolioMonthPoint[]>([])
  const [loadingAnnual, setLoadingAnnual] = useState(false)

  // ── Load monthly ───────────────────────────────────────────────────────────
  const loadMonthly = useCallback(async (month: string) => {
    setLoadingMonthly(true)
    try {
      const res = await fetch(`/api/equity?month=${month}`)
      const data = await res.json()
      setRows(data.rows || [])
      setTotals(data.totals || null)
    } catch (e) { console.error(e) }
    finally { setLoadingMonthly(false) }
  }, [])

  // ── Load annual ────────────────────────────────────────────────────────────
  const loadAnnual = useCallback(async () => {
    setLoadingAnnual(true)
    try {
      const res = await fetch('/api/equity?view=annual')
      const data = await res.json()
      setMatrix(data.matrix || [])
      setAnnualMonths(data.months || [])
      setPortfolioByMonth(data.portfolioByMonth || [])
    } catch (e) { console.error(e) }
    finally { setLoadingAnnual(false) }
  }, [])

  useEffect(() => {
    if (tab === 'monthly') loadMonthly(selectedMonth)
    if (tab === 'annual' && matrix.length === 0) loadAnnual()
  }, [tab, selectedMonth, loadMonthly, loadAnnual, matrix.length])

  // ── Update market value ────────────────────────────────────────────────────
  const updateMarketValue = async (exec_id: number, value: number | null) => {
    await fetch('/api/equity', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exec_id, market_value_end: value }),
    })
    await loadMonthly(selectedMonth)
  }

  const updateAnnualRate = async (forecast_id: number, value: number) => {
    await fetch('/api/equity', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forecast_id, annual_rate: value }),
    })
    await loadMonthly(selectedMonth)
  }

  const updateStartBalance = async (forecast_id: number, value: number) => {
    await fetch('/api/equity', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forecast_id, base_equity: value }),
    })
    await loadMonthly(selectedMonth)
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const thStyle = (align: 'left' | 'right' = 'right'): React.CSSProperties => ({
    padding: '10px 16px',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    textAlign: align,
    position: 'sticky',
    top: 0,
    background: 'var(--bg-base)',
    zIndex: 10,
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  })

  const tdStyle = (align: 'left' | 'right' = 'right'): React.CSSProperties => ({
    padding: '12px 16px',
    fontSize: '12px',
    color: 'var(--text-primary)',
    textAlign: align,
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  })

  const monthLabel = (MONTHS.find(m => m.key === selectedMonth)?.label || '') + ' 2026'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* Header */}
      <div style={{
        padding: '24px 32px 0',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Equity
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {tab === 'monthly' ? monthLabel : 'Full year 2026'} · Double-click to edit Rate, Start Balance (Jan), or Cierre Real
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0' }}>
          {(['monthly', 'annual'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 20px',
              fontSize: '13px', fontWeight: 500,
              cursor: 'pointer',
              background: 'transparent', border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
              marginBottom: '-1px',
            }}>
              {t === 'monthly' ? 'Monthly Detail' : 'Annual Overview'}
            </button>
          ))}
        </div>
      </div>

      {/* ── MONTHLY TAB ───────────────────────────────────────────────────── */}
      {tab === 'monthly' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

          {/* Month selector */}
          <div style={{
            padding: '12px 32px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            display: 'flex', gap: '4px',
            overflowX: 'auto', flexShrink: 0,
          }}>
            {MONTHS.map(m => (
              <button key={m.key} onClick={() => setSelectedMonth(m.key)} style={{
                padding: '6px 14px',
                fontSize: '12px', fontWeight: 500,
                cursor: 'pointer', borderRadius: '6px',
                whiteSpace: 'nowrap',
                border: selectedMonth === m.key ? '1px solid var(--border-strong)' : '1px solid transparent',
                background: selectedMonth === m.key ? 'var(--bg-base)' : 'transparent',
                color: 'var(--text-primary)',
              }}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Summary cards */}
          {totals && (
            <div style={{
              padding: '16px 32px',
              borderBottom: '1px solid var(--border)',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px', flexShrink: 0,
            }}>
              {[
                { label: 'Start Balance', value: formatCOP(totals.start_balance) },
                { label: 'Expected End', value: formatCOP(totals.expected_end) },
                { label: 'Market Value', value: totals.market_value_end !== null ? formatCOP(totals.market_value_end) : '—' },
                { label: 'Market Variance', value: totals.market_variance !== null ? formatCOP(totals.market_variance) : '—' },
              ].map(card => (
                <div key={card.label} style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                    {card.label}
                  </p>
                  <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {card.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingMonthly ? (
              <div style={{ padding: '60px', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-primary)', fontSize: '13px' }}>Loading…</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle('left'), paddingLeft: '32px', width: '220px' }}>Account</th>
                    <th style={thStyle()}>Annual Rate</th>
                    <th style={thStyle()}>Monthly Rate</th>
                    <th style={thStyle()}>Start Balance</th>
                    <th style={thStyle()}>Net Flow</th>
                    <th style={thStyle()}>Expected End</th>
                    <th style={thStyle()}>Cierre Real</th>
                    <th style={thStyle()}>Market Variance</th>
                    <th style={thStyle()}>Return %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const variancePct = row.market_variance !== null && row.expected_end > 0
                      ? (row.market_variance / row.expected_end) * 100
                      : null

                    return (
                      <tr
                        key={row.id}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        {/* Account */}
                        <td style={{ ...tdStyle('left'), paddingLeft: '32px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '16px' }}>{ACCOUNT_ICONS[row.account] || '💰'}</span>
                            <div>
                              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {row.account}
                              </p>
                              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                                {row.equity_type}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Annual Rate — editable */}
                        <td style={tdStyle()}>
                          <EditableRate
                            value={row.annual_rate}
                            onSave={v => updateAnnualRate(row.id, v)}
                          />
                        </td>

                        {/* Monthly Rate — computed, read only */}
                        <td style={{ ...tdStyle(), fontSize: '11px' }}>
                          {(row.monthly_rate * 100).toFixed(4)}%
                        </td>

                        {/* Start Balance — editable only for Jan */}
                        <td style={tdStyle()}>
                          <EditableStartBalance
                            value={row.start_balance}
                            editable={selectedMonth === '2026-01'}
                            onSave={v => updateStartBalance(row.id, v)}
                          />
                        </td>

                        {/* Net Flow — read only, from transactions */}
                        <td style={tdStyle()}>
                          {row.net_flow !== 0
                            ? `${row.net_flow >= 0 ? '+' : ''}${formatCOP(row.net_flow)}`
                            : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>

                        {/* Expected End */}
                        <td style={tdStyle()}>
                          {formatCOP(row.expected_end)}
                        </td>

                        {/* Cierre Real — always editable, badge est. when estimated */}
                        <td style={tdStyle()}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                            <EditableMarketValue
                              value={row.market_value_end}
                              onSave={v => updateMarketValue(row.exec_id!, v)}
                            />
                            {row.is_estimated && (
                              <span style={{
                                fontSize: '9px',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border-strong)',
                                color: 'var(--text-muted)',
                                fontWeight: 600,
                                flexShrink: 0,
                              }}>
                                est.
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Market Variance */}
                        <td style={tdStyle()}>
                          {row.market_variance !== null ? (
                            <span>
                              {`${row.market_variance >= 0 ? '+' : ''}${formatCOP(row.market_variance)}`}
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                                {variancePct !== null ? `(${variancePct >= 0 ? '+' : ''}${variancePct.toFixed(2)}%)` : ''}
                              </span>
                            </span>
                          ) : '—'}
                        </td>

                        {/* Return % */}
                        <td style={{ ...tdStyle(), fontWeight: 600 }}>
                          {formatPct(row.return_pct)}
                        </td>
                      </tr>
                    )
                  })}

                  {/* Portfolio Total row */}
                  {totals && (
                    <tr style={{ background: 'var(--bg-elevated)', borderTop: '2px solid var(--border-strong)' }}>
                      <td style={{ ...tdStyle('left'), paddingLeft: '32px', fontWeight: 700 }}>
                        Portfolio Total
                      </td>
                      <td style={tdStyle()} />
                      <td style={tdStyle()} />
                      <td style={{ ...tdStyle(), fontWeight: 700 }}>
                        {formatCOP(totals.start_balance)}
                      </td>
                      <td style={tdStyle()} />
                      <td style={{ ...tdStyle(), fontWeight: 700 }}>
                        {formatCOP(totals.expected_end)}
                      </td>
                      <td style={{ ...tdStyle(), fontWeight: 700 }}>
                        {totals.market_value_end !== null ? formatCOP(totals.market_value_end) : '—'}
                      </td>
                      <td style={{ ...tdStyle(), fontWeight: 700 }}>
                        {totals.market_variance !== null
                          ? `${totals.market_variance >= 0 ? '+' : ''}${formatCOP(totals.market_variance)}`
                          : '—'}
                      </td>
                      <td style={{ ...tdStyle(), fontWeight: 700 }}>
                        {totals.start_balance > 0
                          ? formatPct(((totals.expected_end - totals.start_balance) / totals.start_balance) * 100)
                          : '—'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── ANNUAL TAB ────────────────────────────────────────────────────── */}
      {tab === 'annual' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingAnnual ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-primary)', fontSize: '13px' }}>Loading…</p>
            </div>
          ) : (
            <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Portfolio Evolution table */}
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                overflow: 'hidden',
              }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Portfolio Evolution
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Projected vs Market Value · Double row per account
                  </p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ ...thStyle('left'), paddingLeft: '20px', width: '160px' }}>Account</th>
                        {annualMonths.map(m => (
                          <th key={m} style={thStyle()}>{MONTH_SHORT[m] || m}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Portfolio total rows */}
                      <tr style={{ borderBottom: 'none' }}>
                        <td style={{ padding: '8px 16px 2px 20px', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Portfolio
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginLeft: '6px', fontWeight: 400 }}>projected</span>
                        </td>
                        {portfolioByMonth.map(p => (
                          <td key={p.month} style={{ padding: '8px 16px 2px', fontSize: '11px', textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                            {formatCOP(p.projected)}
                          </td>
                        ))}
                      </tr>
                      <tr style={{ borderBottom: '2px solid var(--border-strong)' }}>
                        <td style={{ padding: '2px 16px 10px 20px' }} />
                        {portfolioByMonth.map(p => (
                          <td key={p.month} style={{ padding: '2px 16px 10px', fontSize: '13px', fontWeight: 700, textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                            {p.market_value !== null ? formatCOP(p.market_value) : '—'}
                          </td>
                        ))}
                      </tr>

                      {/* Per-account rows */}
                      {matrix.map(row => (
                        <tbody key={row.account}>
                          <tr style={{ borderBottom: 'none' }}>
                            <td style={{ padding: '8px 16px 2px 20px', fontSize: '12px', color: 'var(--text-primary)' }}>
                              {ACCOUNT_ICONS[row.account] || '💰'} {row.account}
                              <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginLeft: '6px' }}>projected</span>
                            </td>
                            {row.months.map(m => (
                              <td key={m.month} style={{ padding: '8px 16px 2px', fontSize: '11px', textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                {m.projected_end !== null ? formatCOP(m.projected_end) : '—'}
                              </td>
                            ))}
                          </tr>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '2px 16px 10px 20px' }} />
                            {row.months.map(m => (
                              <td key={m.month} style={{ padding: '2px 16px 10px', fontSize: '12px', fontWeight: 600, textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                {m.market_value_end !== null ? formatCOP(m.market_value_end) : '—'}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  )
}
