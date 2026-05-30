'use client'

import { useState, useEffect } from 'react'
import { ACCOUNTS, EVENT_TYPES, LEVEL_2_BY_LEVEL_1, LEVEL_3_BY_LEVEL_2 } from '@/lib/constants'

interface FxRate {
  month_label: string
  rate_to_cop: number
}

interface TransactionFormProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  selectedMonth: string
}

const EVENT_TYPE_RULES: Record<string, { from: boolean; to: boolean }> = {
  Opening_Balance: { from: false, to: true },
  Income:          { from: false, to: true },
  Expense:         { from: true,  to: false },
  Transfer:        { from: true,  to: true },
  Investment:      { from: true,  to: true },
  Withdrawal:      { from: true,  to: true },
  Debt_Payment:    { from: true,  to: true },
}

const EVENT_TYPE_TO_LEVEL1: Record<string, string> = {
  Opening_Balance: 'Income',
  Income: 'Income',
  Expense: 'Expense',
  Transfer: 'Financial Movement',
  Investment: 'Equity',
  Withdrawal: 'Financial Movement',
  Debt_Payment: 'Debt',
}

function deriveMonthLabel(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

const inputStyle = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '8px 12px',
  color: 'var(--text-primary)',
  fontSize: '13px',
  outline: 'none',
}

const labelStyle = {
  display: 'block',
  color: 'var(--text-muted)',
  fontSize: '11px',
  fontWeight: '500',
  marginBottom: '6px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
}

const disabledInputStyle = {
  ...inputStyle,
  color: 'var(--text-muted)',
  cursor: 'not-allowed',
  opacity: 0.5,
}

export default function TransactionForm({
  open, onClose, onSuccess, selectedMonth
}: TransactionFormProps) {
  const [loading, setLoading] = useState(false)
  const [fxRates, setFxRates] = useState<FxRate[]>([])

  const defaultForm = () => ({
    date: '',
    month_label: selectedMonth,
    event_type: 'Expense',
    level_1: 'Expense',
    level_2: 'Life',
    level_3: 'Food Market',
    usd_amount: '',
    fx_rate: '',
    amount: '',
    from_account: 'Credit Cards',
    to_account: '',
    notes: '',
  })

  const [form, setForm] = useState(defaultForm())

  useEffect(() => {
    fetch('/api/fx-rates')
      .then(r => r.json())
      .then(setFxRates)
      .catch(console.error)
  }, [])

  // Derive month_label from date automatically
  useEffect(() => {
    if (form.date) {
      const ml = deriveMonthLabel(form.date)
      const rate = fxRates.find(r => r.month_label === ml)
      setForm(f => ({
        ...f,
        month_label: ml,
        fx_rate: rate ? String(rate.rate_to_cop) : f.fx_rate,
      }))
    }
  }, [form.date, fxRates])

  // Auto-compute COP amount from USD x FX
  useEffect(() => {
    if (form.usd_amount && form.fx_rate) {
      const computed = Math.round(
        parseFloat(form.usd_amount) * parseFloat(form.fx_rate)
      ).toString()
      setForm(f => ({ ...f, amount: computed }))
    }
  }, [form.usd_amount, form.fx_rate])

  // Cascade event_type -> level_1 -> level_2 -> level_3
  useEffect(() => {
    const l1 = EVENT_TYPE_TO_LEVEL1[form.event_type] || 'Expense'
    const l2options = LEVEL_2_BY_LEVEL_1[l1] || []
    const l2 = l2options[0] || ''
    const l3options = LEVEL_3_BY_LEVEL_2[l2] || []
    const l3 = l3options[0] || ''
    setForm(f => ({ ...f, level_1: l1, level_2: l2, level_3: l3 }))
  }, [form.event_type])

  useEffect(() => {
    const l3options = LEVEL_3_BY_LEVEL_2[form.level_2] || []
    setForm(f => ({ ...f, level_3: l3options[0] || '' }))
  }, [form.level_2])

  const rules = EVENT_TYPE_RULES[form.event_type] || { from: true, to: false }

  const handleSubmit = async () => {
    if (!form.date || !form.amount) return
    setLoading(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Failed')
      onSuccess()
      onClose()
      setForm(defaultForm())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col"
        style={{
          width: '440px',
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2
            className="font-semibold text-base"
            style={{ color: 'var(--text-primary)' }}
          >
            New Transaction
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'
              ;(e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'transparent'
              ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Date */}
            <div>
              <label style={labelStyle}>Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                style={inputStyle}
              />
              {form.month_label && (
                <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>
                  Month: {form.month_label}
                </p>
              )}
            </div>

            {/* Event Type */}
            <div>
              <label style={labelStyle}>Event Type *</label>
              <select
                value={form.event_type}
                onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {EVENT_TYPES.map(et => (
                  <option
                    key={et}
                    value={et}
                    style={{ background: 'var(--bg-surface)' }}
                  >
                    {et.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* Category row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Level 1</label>
                <input
                  type="text"
                  value={form.level_1}
                  readOnly
                  style={disabledInputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Level 2 *</label>
                <select
                  value={form.level_2}
                  onChange={e => setForm(f => ({ ...f, level_2: e.target.value }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {(LEVEL_2_BY_LEVEL_1[form.level_1] || []).map(l2 => (
                    <option key={l2} value={l2} style={{ background: 'var(--bg-surface)' }}>
                      {l2}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Level 3 */}
            {(LEVEL_3_BY_LEVEL_2[form.level_2] || []).length > 0 && (
              <div>
                <label style={labelStyle}>Level 3</label>
                <select
                  value={form.level_3}
                  onChange={e => setForm(f => ({ ...f, level_3: e.target.value }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="" style={{ background: 'var(--bg-surface)' }}>&mdash; none &mdash;</option>
                  {(LEVEL_3_BY_LEVEL_2[form.level_2] || []).map(l3 => (
                    <option key={l3} value={l3} style={{ background: 'var(--bg-surface)' }}>
                      {l3}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Divider */}
            <div style={{ borderTop: '1px solid var(--border)' }} />

            {/* Amount section */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>USD Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.usd_amount}
                  onChange={e => setForm(f => ({ ...f, usd_amount: e.target.value }))}
                  placeholder="optional"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>FX Rate</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.fx_rate}
                  onChange={e => setForm(f => ({ ...f, fx_rate: e.target.value }))}
                  placeholder="auto"
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Amount COP *</label>
              <input
                type="number"
                step="1"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                style={{
                  ...inputStyle,
                  fontSize: '15px',
                  fontWeight: '600',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid var(--border)' }} />

            {/* Accounts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>
                  From {rules.from ? '*' : ''}
                </label>
                <select
                  value={form.from_account}
                  onChange={e => setForm(f => ({ ...f, from_account: e.target.value }))}
                  disabled={!rules.from}
                  style={rules.from
                    ? { ...inputStyle, cursor: 'pointer' }
                    : disabledInputStyle
                  }
                >
                  <option value="" style={{ background: 'var(--bg-surface)' }}>&mdash; none &mdash;</option>
                  {ACCOUNTS.map(a => (
                    <option key={a} value={a} style={{ background: 'var(--bg-surface)' }}>{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>
                  To {rules.to ? '*' : ''}
                </label>
                <select
                  value={form.to_account}
                  onChange={e => setForm(f => ({ ...f, to_account: e.target.value }))}
                  disabled={!rules.to}
                  style={rules.to
                    ? { ...inputStyle, cursor: 'pointer' }
                    : disabledInputStyle
                  }
                >
                  <option value="" style={{ background: 'var(--bg-surface)' }}>&mdash; none &mdash;</option>
                  {ACCOUNTS.map(a => (
                    <option key={a} value={a} style={{ background: 'var(--bg-surface)' }}>{a}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={labelStyle}>Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional description"
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex gap-3 shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              border: '1px solid var(--border-strong)',
              color: 'var(--text-secondary)',
              background: 'transparent',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !form.date || !form.amount}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: loading || !form.date || !form.amount
                ? 'var(--bg-elevated)'
                : 'var(--text-primary)',
              color: loading || !form.date || !form.amount
                ? 'var(--text-muted)'
                : 'var(--text-inverse)',
              cursor: loading || !form.date || !form.amount ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Saving\u2026' : 'Save Transaction'}
          </button>
        </div>
      </div>
    </>
  )
}
