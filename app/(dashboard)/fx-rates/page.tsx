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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export default function FxRatesPage() {
  const [daily, setDaily] = useState<DailyRate[]>([])
  const [monthly, setMonthly] = useState<MonthlyRate[]>([])
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [lastFetch, setLastFetch] = useState<string | null>(null)
  const [todayRate, setTodayRate] = useState<number | null>(null)

  const loadRates = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/fx-rates')
      const data = await res.json()
      setDaily(data.daily || [])
      setMonthly(data.monthly || [])
      if (data.daily?.length > 0) {
        const latest = data.daily[0]
        setTodayRate(parseFloat(latest.rate_to_cop))
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
    try {
      const res = await fetch('/api/fx-rates', { method: 'POST' })
      const data = await res.json()
      setLastFetch(data.message || 'Done')
      setTodayRate(data.rate_to_cop || null)
      await loadRates()
    } catch (e) {
      console.error(e)
      setLastFetch('Error fetching rate')
    } finally {
      setFetching(false)
    }
  }

  // Compute 30-day stats
  const rates = daily.map(r => parseFloat(r.rate_to_cop)).filter(Boolean)
  const minRate = rates.length > 0 ? Math.min(...rates) : 0
  const maxRate = rates.length > 0 ? Math.max(...rates) : 0
  const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{
        padding: '24px 32px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
            FX Rates
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Daily USD/COP rates · Auto-fetched from open.er-api.com
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {lastFetch && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {lastFetch}
            </span>
          )}
          <button
            onClick={handleFetchToday}
            disabled={fetching}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: fetching ? 'var(--bg-elevated)' : 'var(--text-primary)',
              color: fetching ? 'var(--text-muted)' : 'var(--text-inverse)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: fetching ? 'not-allowed' : 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
              <path d="M16 16h5v5"/>
            </svg>
            {fetching ? 'Fetching…' : 'Fetch Today'}
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Today's rate hero */}
        {todayRate && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
            {[
              { label: 'Today\'s TRM', value: `${formatCOP(todayRate)}`, sub: 'COP per 1 USD' },
              { label: '30-Day Average', value: `${formatCOP(avgRate)}`, sub: 'COP per 1 USD' },
              { label: '30-Day Low', value: `${formatCOP(minRate)}`, sub: 'COP per 1 USD' },
              { label: '30-Day High', value: `${formatCOP(maxRate)}`, sub: 'COP per 1 USD' },
            ].map(card => (
              <div key={card.label} style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '16px 20px',
              }}>
                <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                  {card.label}
                </p>
                <p style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {card.value}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {card.sub}
                </p>
              </div>
            ))}
          </div>
        )}

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
                Click &quot;Fetch Today&quot; to get today&apos;s TRM
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'USD → COP', 'COP → USD', 'Source', 'Fetched At'].map((h, i) => (
                    <th key={h} style={{
                      padding: '10px 20px',
                      textAlign: i >= 1 && i <= 2 ? 'right' : 'left',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
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
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent'
                    }}
                  >
                    <td style={{ padding: '12px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {formatDate(r.date)}
                      {i === 0 && (
                        <span style={{
                          marginLeft: '8px',
                          fontSize: '10px',
                          fontWeight: 600,
                          background: 'var(--bg-elevated)',
                          color: 'var(--text-secondary)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}>
                          Latest
                        </span>
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
                Used for historical transactions (Jan–Apr 2026 seed data)
              </p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Month', 'USD → COP', 'Currency'].map((h, i) => (
                    <th key={h} style={{
                      padding: '10px 20px',
                      textAlign: i === 1 ? 'right' : 'left',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
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
