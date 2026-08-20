'use client'

import { useState, useEffect } from 'react'

interface FxRate {
  month_label: string
  rate_to_cop: number
}

interface CategoryDef {
  id: number
  level_1: string
  level_2: string
  level_3: string | null
  is_active: boolean
}

interface AccountDef {
  name: string
  type: string
  is_active: boolean
}

interface TransactionFormProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  selectedMonth: string
}

// ─── Dynamic rules per event type ─────────────────────────────────────────────
type FieldVisibility = 'required' | 'optional' | 'hidden'

interface EventTypeRules {
  fromAccount: FieldVisibility
  toAccount: FieldVisibility
  fromAccountFilter?: 'all' | 'investment' | 'debt' | 'cash'
  toAccountFilter?: 'all' | 'investment' | 'debt' | 'cash'
  level1Filter?: string
  autoLevel2?: string
}

const EVENT_TYPE_RULES: Record<string, EventTypeRules> = {
  Income: {
    fromAccount: 'hidden',
    toAccount: 'required',
    level1Filter: 'Income',
  },
  Expense: {
    fromAccount: 'required',
    toAccount: 'hidden',
    level1Filter: 'Expense',
  },
  Transfer: {
    fromAccount: 'required',
    toAccount: 'required',
    autoLevel2: 'Financial Movement',
  },
  Investment: {
    fromAccount: 'required',
    toAccount: 'required',
    fromAccountFilter: 'cash',
    toAccountFilter: 'investment',
    level1Filter: 'Equity',
  },
  Withdrawal: {
    fromAccount: 'required',
    toAccount: 'required',
    fromAccountFilter: 'investment',
    toAccountFilter: 'cash',
    level1Filter: 'Equity',
  },
  Debt_Payment: {
    fromAccount: 'required',
    toAccount: 'required',
    fromAccountFilter: 'cash',
    toAccountFilter: 'debt',
    autoLevel2: 'Credit Cards',
  },
  Debt_Increase: {
    fromAccount: 'required',
    toAccount: 'required',
    fromAccountFilter: 'debt',
    toAccountFilter: 'cash',
    autoLevel2: 'Credit Cards',
  },
  Opening_Balance: {
    fromAccount: 'hidden',
    toAccount: 'required',
    level1Filter: 'Equity',
  },
}

const EVENT_TYPE_TO_LEVEL1: Record<string, string> = {
  Opening_Balance: 'Income',
  Income: 'Income',
  Expense: 'Expense',
  Transfer: 'Financial Movement',
  Investment: 'Equity',
  Withdrawal: 'Financial Movement',
  Debt_Payment: 'Debt',
  Debt_Increase: 'Debt',
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
  display: 'block' as const,
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
  const [formError, setFormError] = useState<string | null>(null)
  const [fxRates, setFxRates] = useState<FxRate[]>([])
  const [eventTypeOptions, setEventTypeOptions] = useState<string[]>([])
  const [categoryDefs, setCategoryDefs] = useState<CategoryDef[]>([])
  const [accountsByType, setAccountsByType] = useState<{
    all: string[]
    cash: string[]
    investment: string[]
    debt: string[]
  }>({ all: [], cash: [], investment: [], debt: [] })

  // Derive lookup maps from categoryDefs
  const level2ByLevel1: Record<string, string[]> = {}
  const level3ByLevel2: Record<string, string[]> = {}
  for (const c of categoryDefs.filter(c => c.is_active)) {
    if (!level2ByLevel1[c.level_1]) level2ByLevel1[c.level_1] = []
    if (!level2ByLevel1[c.level_1].includes(c.level_2)) {
      level2ByLevel1[c.level_1].push(c.level_2)
    }
    if (c.level_3) {
      if (!level3ByLevel2[c.level_2]) level3ByLevel2[c.level_2] = []
      if (!level3ByLevel2[c.level_2].includes(c.level_3)) {
        level3ByLevel2[c.level_2].push(c.level_3)
      }
    }
  }

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

  // Helper to update form and clear errors
  const updateForm = (updater: (f: typeof form) => typeof form) => {
    setFormError(null)
    setForm(updater)
  }

  useEffect(() => {
    fetch('/api/fx-rates')
      .then(r => r.json())
      .then(data => setFxRates(data.monthly || []))
      .catch(console.error)
    fetch('/api/data-source')
      .then(r => r.json())
      .then((data: { accounts: AccountDef[]; categories: CategoryDef[]; eventTypes: { name: string; is_active: boolean }[] }) => {
        const activeAccounts = data.accounts.filter(a => a.is_active)
        setAccountsByType({
          all: activeAccounts.map(a => a.name),
          cash: activeAccounts.filter(a => a.type === 'cash').map(a => a.name),
          investment: activeAccounts.filter(a => a.type === 'investment').map(a => a.name),
          debt: activeAccounts.filter(a => a.type === 'debt').map(a => a.name),
        })
        setCategoryDefs(data.categories)
        setEventTypeOptions(data.eventTypes.filter(e => e.is_active).map(e => e.name))
      })
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
    const rules = EVENT_TYPE_RULES[form.event_type]
    const l2options = level2ByLevel1[l1] || []
    const l2 = rules?.autoLevel2 || l2options[0] || ''
    const l3options = level3ByLevel2[l2] || []
    const l3 = l3options[0] || ''
    setForm(f => ({ ...f, level_1: l1, level_2: l2, level_3: l3 }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.event_type, categoryDefs])

  useEffect(() => {
    const l3options = level3ByLevel2[form.level_2] || []
    setForm(f => ({ ...f, level_3: l3options[0] || '' }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.level_2, categoryDefs])

  // ─── Computed rules ───────────────────────────────────────────────────────
  const currentRules = EVENT_TYPE_RULES[form.event_type] || {
    fromAccount: 'optional' as FieldVisibility,
    toAccount: 'optional' as FieldVisibility,
  }

  const fromAccountOptions = currentRules.fromAccountFilter
    ? accountsByType[currentRules.fromAccountFilter]
    : accountsByType.all

  const toAccountOptions = currentRules.toAccountFilter
    ? accountsByType[currentRules.toAccountFilter]
    : accountsByType.all

  // ─── Event type change handler ────────────────────────────────────────────
  const handleEventTypeChange = (newEventType: string) => {
    const rules = EVENT_TYPE_RULES[newEventType] || {}
    setFormError(null)
    setForm(prev => ({
      ...prev,
      event_type: newEventType,
      from_account: rules.fromAccount === 'hidden' ? '' : prev.from_account,
      to_account: rules.toAccount === 'hidden' ? '' : prev.to_account,
    }))
  }

  // ─── Validation ───────────────────────────────────────────────────────────
  const validateForm = (): string | null => {
    if (!form.event_type) return 'Event type is required'
    if (!form.date) return 'Date is required'
    if (!form.amount && !form.usd_amount) return 'Amount is required'

    const rules = EVENT_TYPE_RULES[form.event_type]
    if (rules) {
      if (rules.fromAccount === 'required' && !form.from_account) {
        return `FROM account is required for ${form.event_type.replace(/_/g, ' ')}`
      }
      if (rules.toAccount === 'required' && !form.to_account) {
        return `TO account is required for ${form.event_type.replace(/_/g, ' ')}`
      }
    }
    return null
  }

  const handleSubmit = async () => {
    const error = validateForm()
    if (error) {
      setFormError(error)
      return
    }
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
      setFormError(null)
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
        className="slide-panel fixed right-0 top-0 h-full z-50 flex flex-col"
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
                onChange={e => updateForm(f => ({ ...f, date: e.target.value }))}
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
                onChange={e => handleEventTypeChange(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {eventTypeOptions.map(et => (
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
            <div className="g-2" style={{ gap: '12px' }}>
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
                  onChange={e => updateForm(f => ({ ...f, level_2: e.target.value }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {(level2ByLevel1[form.level_1] || []).map(l2 => (
                    <option key={l2} value={l2} style={{ background: 'var(--bg-surface)' }}>
                      {l2}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Level 3 */}
            {(level3ByLevel2[form.level_2] || []).length > 0 && (
              <div>
                <label style={labelStyle}>Level 3</label>
                <select
                  value={form.level_3}
                  onChange={e => updateForm(f => ({ ...f, level_3: e.target.value }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="" style={{ background: 'var(--bg-surface)' }}>&mdash; none &mdash;</option>
                  {(level3ByLevel2[form.level_2] || []).map(l3 => (
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
            <div className="g-2" style={{ gap: '12px' }}>
              <div>
                <label style={labelStyle}>USD Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.usd_amount}
                  onChange={e => updateForm(f => ({ ...f, usd_amount: e.target.value }))}
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
                  onChange={e => updateForm(f => ({ ...f, fx_rate: e.target.value }))}
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
                onChange={e => updateForm(f => ({ ...f, amount: e.target.value }))}
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

            {/* Accounts — dynamic visibility */}
            <div className="g-2" style={{ gridTemplateColumns: currentRules.fromAccount !== 'hidden' && currentRules.toAccount !== 'hidden' ? '1fr 1fr' : '1fr', gap: '12px' }}>
              {currentRules.fromAccount !== 'hidden' && (
                <div>
                  <label style={labelStyle}>
                    From {currentRules.fromAccount === 'required' && <span style={{ color: 'var(--accent)' }}>*</span>}
                  </label>
                  <select
                    value={form.from_account}
                    onChange={e => updateForm(f => ({ ...f, from_account: e.target.value }))}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="" style={{ background: 'var(--bg-surface)' }}>&mdash; none &mdash;</option>
                    {fromAccountOptions.map(a => (
                      <option key={a} value={a} style={{ background: 'var(--bg-surface)' }}>{a}</option>
                    ))}
                  </select>
                </div>
              )}
              {currentRules.toAccount !== 'hidden' && (
                <div>
                  <label style={labelStyle}>
                    To {currentRules.toAccount === 'required' && <span style={{ color: 'var(--accent)' }}>*</span>}
                  </label>
                  <select
                    value={form.to_account}
                    onChange={e => updateForm(f => ({ ...f, to_account: e.target.value }))}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="" style={{ background: 'var(--bg-surface)' }}>&mdash; none &mdash;</option>
                    {toAccountOptions.map(a => (
                      <option key={a} value={a} style={{ background: 'var(--bg-surface)' }}>{a}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label style={labelStyle}>Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => updateForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional description"
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="slide-panel-footer px-6 py-4 flex flex-col gap-3 shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {formError && (
            <div style={{
              padding: '8px 12px',
              background: 'var(--accent-subtle)',
              border: '1px solid var(--accent-border)',
              borderRadius: '6px',
              fontSize: '12px',
              color: 'var(--accent)',
            }}>
              {formError}
            </div>
          )}
          <div className="flex gap-3">
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
              disabled={loading}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: loading ? 'var(--bg-elevated)' : 'var(--text-primary)',
                color: loading ? 'var(--text-muted)' : 'var(--text-inverse)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Saving\u2026' : 'Save Transaction'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
