'use client'

import { useState, useEffect } from 'react'

interface DailyRate {
  id: number
  date: string
  currency: string
  rate_to_cop: string
  rate_from_cop: string
  source: string
  fetched_at: string
}

interface MonthlyRate {
  month_label: string
  currency: string
  rate_to_cop: string
}

interface BackfillResult {
  filled: number
  skipped: number
  errors: number
  message: string
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric',
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

// Default backfill range: last 30 days
function defaultFrom() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().split('T')[0]
}

function defaultTo() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

export default function FxRatesPage() {
  const [daily, setDaily] = useState<DailyRate[]>([])
  const [monthly, setMonthly] = useState<MonthlyRate[]>([])
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [lastFetch, setLastFetch] = useState<string | null>(null)
  const [todayRate, setTodayRate] = useState<number | null>(null)

  // Backfill state
  const [backfillFrom, setBackfillFrom] = useState(defaultFrom())
  const [backfillTo, setBackfillTo] = useState(defaultTo())
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null)
  const [backfillProgress, setBackfillProgress] = useState<string | null>(null)

  const loadRates = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/fx-rates')
      const data = await res.json()
      setDaily(data.daily || [])
      setMonthly(data.monthly || [])
      if (data.daily?.length > 0) {
        setTodayRate(parseFloat(data.daily[0].rate_to_cop))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadRates() }, [])

  const handleFetchToday = async () => {
    setFetching(true)
    setLastFetch(null)
    try {
      const res = await fetch('/api/fx-rates', { method: 'POST' })
      const data = await res.json()
      setLastFetch(data.message || 'Done')
      if (data.rate_to_cop) setTodayRate(data.rate_to_cop)
      await loadRates()
    } catch (e) {
      console.error(e)
      setLastFetch('Error fetching rate')
    } finally {
      setFetching(false)
    }
  }

  const handleBackfill = async () => {
    if (!backfillFrom || !backfillTo) return
    setBackfilling(true)
    setBackfillResult(null)
    setBackfillProgress('Fetching historical rates from Frankfurter…')

    try {
      const res = await fetch('/api/fx-rates/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: backfillFrom, to: backfillTo }),
      })
      const data = await res.json()

      if (!res.ok) {
        setBackfillProgress(null)
        setBackfillResult({ filled: 0, skipped: 0, errors: 1, message: data.error })
        return
      }

      setBackfillResult(data)
      setBackfillProgress(null)
      await loadRates()
    } catch (e) {
      console.error(e)
      setBackfillProgress(null)
      setBackfillResult({ filled: 0, skipped: 0, errors: 1, message: 'Request failed' })
    } finally {
      setBackfilling(false)
    }
  }

  const rates = daily.map(r => parseFloat(r.rate_to_cop)).filter(Boolean)
  const minRate = rates.length > 0 ? Math.min(...rates) : 0
  const maxRate = rates.length > 0 ? Math.max(...rates) : 0
  const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0

  const inputStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '8px 12px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>

      {/* Header */}
      <div className="header-row page-header" style={{
        padding: '24px 32px',
        borderBottom: '1px solid var(--border)',
        alignItems: 'flex-start',
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
            FX Rates
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Daily USD/COP · Auto-fetched daily · Historical via Frankfurter
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {lastFetch && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{lastFetch}</span>
          )}
          <button
            onClick={handleFetchToday}
            disabled={fetching}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 16px',
              background: fetching ? 'var(--bg-elevated)' : 'var(--accent)',
              color: fetching ? 'var(--text-muted)' : '#ffffff',
              border: 'none', borderRadius: '8px',
              fontSize: '13px', fontWeight: 600,
              cursor: fetching ? 'not-allowed' : 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            {fetching ? 'Fetching…' : 'Fetch Today'}
          </button>
        </div>
      </div>

      <div className="page-body" style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Stats cards */}
        {todayRate !== null && (
          <div className="g-4" style={{ gap: '16px' }}>
            {[
              { label: "Today's TRM", value: formatCOP(todayRate), sub: 'COP per 1 USD' },
              { label: '30-Day Average', value: formatCOP(avgRate), sub: 'COP per 1 USD' },
              { label: '30-Day Low', value: formatCOP(minRate), sub: 'COP per 1 USD' },
              { label: '30-Day High', value: formatCOP(maxRate), sub: 'COP per 1 USD' },
            ].map(card => (
              <div key={card.label} style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '16px 20px',
              }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                  {card.label}
                </p>
                <p style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  ${card.value}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {card.sub}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── BACKFILL PANEL ────────────────────────────────────────────────── */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '20px 24px',
        }}>
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Fill Missing Rates
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Use this when you haven&apos;t opened the app for several days and need historical TRM
              for transactions you&apos;re adding now. Max 90 days per request.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                From
              </label>
              <input
                type="date"
                value={backfillFrom}
                onChange={e => setBackfillFrom(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                To
              </label>
              <input
                type="date"
                value={backfillTo}
                onChange={e => setBackfillTo(e.target.value)}
                style={inputStyle}
              />
            </div>
            <button
              onClick={handleBackfill}
              disabled={backfilling || !backfillFrom || !backfillTo}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 20px',
                background: 'transparent',
                color: backfilling ? 'var(--text-muted)' : 'var(--accent)',
                border: '1px solid var(--accent-border)',
                borderRadius: '8px',
                fontSize: '13px', fontWeight: 600,
                cursor: backfilling ? 'not-allowed' : 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M8 16H3v5"/>
              </svg>
              {backfilling ? 'Fetching…' : 'Fill Missing Rates'}
            </button>
          </div>

          {/* Progress / Result */}
          {backfillProgress && (
            <div style={{
              marginTop: '12px',
              padding: '10px 14px',
              background: 'var(--bg-elevated)',
              borderRadius: '8px',
              border: '1px solid var(--border)',
            }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {backfillProgress}
              </p>
            </div>
          )}

          {backfillResult && (
            <div style={{
              marginTop: '12px',
              padding: '12px 16px',
              background: 'var(--bg-elevated)',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              display: 'flex',
              gap: '24px',
              alignItems: 'center',
            }}>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Filled</p>
                <p style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {backfillResult.filled}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Already had</p>
                <p style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {backfillResult.skipped}
                </p>
              </div>
              {backfillResult.errors > 0 && (
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Errors</p>
                  <p style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {backfillResult.errors}
                  </p>
                </div>
              )}
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {backfillResult.message}
              </p>
            </div>
          )}
        </div>

        {/* Daily rates table */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Daily Rates
            </p>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {daily.length} days stored
            </span>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</p>
            </div>
          ) : daily.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                No rates stored yet
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Click &quot;Fetch Today&quot; or use &quot;Fill Missing Rates&quot; to populate
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'USD → COP', 'COP → USD', 'Source', 'Fetched At'].map((h, i) => (
                    <th key={h} style={{
                      padding: '10px 20px',
                      textAlign: i >= 1 && i <= 2 ? 'right' : 'left',
                      fontSize: '11px', fontWeight: 700,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {daily.map((r, i) => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: i < daily.length - 1 ? '1px solid var(--border)' : 'none' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <td style={{ padding: '12px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {formatDate(r.date)}
                      {i === 0 && (
                        <span style={{
                          marginLeft: '8px', fontSize: '10px', fontWeight: 600,
                          background: 'var(--accent-subtle)', color: 'var(--accent)',
                          padding: '2px 6px', borderRadius: '4px',
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}>Latest</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      ${formatCOP(parseFloat(r.rate_to_cop))}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {parseFloat(r.rate_from_cop).toFixed(6)}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {r.source}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {new Date(r.fetched_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Monthly reference rates */}
        {monthly.length > 0 && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Monthly Reference Rates
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Used for historical seed data (Jan–Apr 2026)
              </p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Month', 'USD → COP', 'Currency'].map((h, i) => (
                    <th key={h} style={{
                      padding: '10px 20px',
                      textAlign: i === 1 ? 'right' : 'left',
                      fontSize: '11px', fontWeight: 700,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthly.map((r, i) => (
                  <tr key={r.month_label} style={{ borderBottom: i < monthly.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '12px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {r.month_label}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      ${formatCOP(parseFloat(r.rate_to_cop))}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {r.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  )
}
