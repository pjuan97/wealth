'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useCurrencyPreference } from '@/app/components/CurrencyPreferenceProvider'

// ─── Types ────────────────────────────────────────────────────────────────────
interface CategoryDef {
  id: number
  level_1: string
  level_2: string
  level_3: string | null
}
type Currency = 'COP' | 'USD'

interface PlanRow {
  id: number
  month_label: string
  event_type: string
  level_2: string
  level_3: string | null
  base: number
  inflation: number
  currency: Currency
  plan: number
  executed: number
  diff: number
  achievement: number | null
}

interface CurrencyTotals {
  income_plan: number
  income_exec: number
  expense_plan: number
  expense_exec: number
}

interface MonthlyTotals {
  COP: CurrencyTotals
  USD: CurrencyTotals
}

interface AnnualCurrencySummary {
  income_plan: number
  income_exec: number
  expense_plan: number
  expense_exec: number
  balance_plan: number
  balance_exec: number
  savings_rate_plan: number
  savings_rate_exec: number
}

interface AnnualSummaryRow {
  month: string
  COP: AnnualCurrencySummary
  USD: AnnualCurrencySummary
}

interface CategoryAnnualRow {
  eventType: string
  level_2: string
  level_3: string | null
  currency: Currency
  months: {
    month: string
    plan: number
    exec: number
    diff: number
    achievement: number | null
  }[]
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

// Default the Monthly Detail tab to today's month, clamped to the range this
// app tracks (2026) — a fixed default meant a user whose Plan lives outside
// April (like Dani's Jul-Dec data) would land on an empty month.
function getDefaultMonth(): string {
  const todayKey = new Date().toISOString().slice(0, 7)
  if (MONTHS.some(m => m.key === todayKey)) return todayKey
  return todayKey < MONTHS[0].key ? MONTHS[0].key : MONTHS[MONTHS.length - 1].key
}

const MONTH_SHORT: Record<string, string> = {
  '2026-01': 'Jan', '2026-02': 'Feb', '2026-03': 'Mar',
  '2026-04': 'Apr', '2026-05': 'May', '2026-06': 'Jun',
  '2026-07': 'Jul', '2026-08': 'Aug', '2026-09': 'Sep',
  '2026-10': 'Oct', '2026-11': 'Nov', '2026-12': 'Dec',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

function formatUSD(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

function formatMoney(n: number, currency: Currency) {
  return currency === 'USD' ? formatUSD(n) : formatCOP(n)
}

function formatAchievementPct(n: number | null) {
  if (n === null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function formatVariance(diff: number, plan: number, eventType: string): {
  text: string
  color: string
} {
  if (!plan || plan === 0) return { text: '—', color: 'var(--text-muted)' }

  const pct = (diff / plan) * 100
  const isGood = eventType === 'Income' ? pct >= 0 : pct <= 0
  const isNeutral = Math.abs(pct) <= 5

  const text = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`

  if (isNeutral) return { text, color: 'var(--text-primary)' }
  if (isGood) return { text, color: 'var(--accent)' }
  return { text, color: 'var(--text-secondary)' }
}

// ─── Editable cell ────────────────────────────────────────────────────────────
// Displays and edits in the user's chosen display currency (global toggle),
// converting to/from the row's real native currency for storage — so editing
// "$500" while viewing in USD saves the correct native-currency amount even
// if the Plan row itself is actually stored in COP, or vice versa.
function EditableAmount({
  value,
  nativeCurrency,
  month,
  onSave,
}: {
  value: number
  nativeCurrency: Currency
  month?: string
  onSave: (newValue: number) => Promise<void>
}) {
  const { displayCurrency, convert, convertToNative } = useCurrencyPreference()
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')
  const [saving, setSaving] = useState(false)

  const displayValue = convert(value, nativeCurrency, month)

  const handleDoubleClick = () => {
    setRaw(displayCurrency === 'USD' ? String(Math.round(displayValue * 100) / 100) : String(Math.round(displayValue)))
    setEditing(true)
  }

  const handleSave = async () => {
    const num = parseFloat(raw.replace(/[^0-9.]/g, ''))
    if (isNaN(num)) { setEditing(false); return }
    setSaving(true)
    await onSave(convertToNative(num, nativeCurrency, month))
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
          width: '110px',
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
      title="Double-click to edit"
      style={{
        cursor: 'text',
        fontVariantNumeric: 'tabular-nums',
        fontSize: '12px',
        color: 'var(--text-primary)',
        borderBottom: '1px dashed var(--border-strong)',
        paddingBottom: '1px',
      }}
    >
      {formatMoney(displayValue, displayCurrency)}
    </span>
  )
}

// ─── Add Plan Item modal ────────────────────────────────────────────────────
function AddPlanItemModal({
  categories,
  onClose,
  onSaved,
}: {
  categories: CategoryDef[]
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const [eventType, setEventType] = useState<'Income' | 'Expense'>('Expense')
  const [level2, setLevel2] = useState('')
  const [level3, setLevel3] = useState('')
  const [currency, setCurrency] = useState<Currency>('COP')
  const [amount, setAmount] = useState('')
  const [months, setMonths] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const level2Options = useMemo(() => (
    [...new Set(categories.filter(c => c.level_1 === eventType).map(c => c.level_2))].sort()
  ), [categories, eventType])

  const level3Options = useMemo(() => (
    [...new Set(
      categories
        .filter(c => c.level_1 === eventType && c.level_2 === level2 && c.level_3)
        .map(c => c.level_3 as string)
    )].sort()
  ), [categories, eventType, level2])

  const level3Locked = level2 !== '' && level3Options.length === 0

  const toggleMonth = (m: string) => {
    setMonths(prev => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      return next
    })
  }

  const amountNum = parseFloat(amount.replace(/[^0-9.]/g, ''))
  const canSave = !!level2 && months.size > 0 && Number.isFinite(amountNum) && amountNum >= 0 && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: eventType,
          level_2: level2,
          level_3: level3 || null,
          months: [...months],
          amount: amountNum,
          currency,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to save plan item')
        return
      }
      await onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSaving(false)
    }
  }

  const fieldLabel: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
    display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em',
  }
  const selectStyle: React.CSSProperties = {
    width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
    borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px',
    }}>
      <div className="modal-box" style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
        borderRadius: '16px', width: '480px', maxHeight: '85dvh', overflowY: 'auto',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Add Plan Item
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Define a category and apply one amount across the months you pick.
          </p>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Event Type */}
          <div>
            <label style={fieldLabel}>Event Type</label>
            <select
              style={selectStyle}
              value={eventType}
              onChange={e => {
                setEventType(e.target.value as 'Income' | 'Expense')
                setLevel2('')
                setLevel3('')
              }}
            >
              <option value="Income">Income</option>
              <option value="Expense">Expense</option>
            </select>
          </div>

          {/* Category (Level 2) */}
          <div>
            <label style={fieldLabel}>Category</label>
            <select
              style={selectStyle}
              value={level2}
              onChange={e => { setLevel2(e.target.value); setLevel3('') }}
            >
              <option value="">Select a category…</option>
              {level2Options.map(l2 => <option key={l2} value={l2}>{l2}</option>)}
            </select>
            {level2Options.length === 0 && (
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                No {eventType} categories defined in Data Source yet.
              </p>
            )}
          </div>

          {/* Subcategory (Level 3) — locked if none defined */}
          <div>
            <label style={fieldLabel}>Subcategory</label>
            <select
              style={{
                ...selectStyle,
                opacity: level3Locked || !level2 ? 0.5 : 1,
                cursor: level3Locked || !level2 ? 'not-allowed' : 'pointer',
              }}
              value={level3}
              disabled={level3Locked || !level2}
              onChange={e => setLevel3(e.target.value)}
            >
              <option value="">
                {!level2 ? 'Select a category first' : level3Locked ? 'No subcategories defined' : 'None'}
              </option>
              {level3Options.map(l3 => <option key={l3} value={l3}>{l3}</option>)}
            </select>
          </div>

          {/* Currency + Amount */}
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px' }}>
            <div>
              <label style={fieldLabel}>Currency</label>
              <select
                style={selectStyle}
                value={currency}
                onChange={e => setCurrency(e.target.value as Currency)}
              >
                <option value="COP">COP</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label style={fieldLabel}>Amount</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder={currency === 'USD' ? 'e.g. 500.00' : 'e.g. 500000'}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                style={selectStyle}
              />
            </div>
          </div>

          {/* Months */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ ...fieldLabel, marginBottom: 0 }}>Apply to months</label>
              <button
                type="button"
                onClick={() => setMonths(months.size === MONTHS.length ? new Set() : new Set(MONTHS.map(m => m.key)))}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--accent)',
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {months.size === MONTHS.length ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="g-months" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {MONTHS.map(m => (
                <label
                  key={m.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
                    border: months.has(m.key) ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                    background: months.has(m.key) ? 'var(--accent-subtle)' : 'transparent',
                    fontSize: '12px',
                    color: months.has(m.key) ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={months.has(m.key)}
                    onChange={() => toggleMonth(m.key)}
                    style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', background: 'rgba(249,115,22,0.08)',
              border: '1px solid var(--accent-border)', borderRadius: '8px',
              fontSize: '12px', color: 'var(--accent)',
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
            background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', cursor: 'pointer',
          }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              background: canSave ? 'var(--accent)' : 'var(--bg-elevated)',
              color: canSave ? '#fff' : 'var(--text-muted)',
              border: 'none', cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Saving…' : 'Add Plan Item'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PlanPage() {
  const { displayCurrency, convert } = useCurrencyPreference()
  const [tab, setTab] = useState<'monthly' | 'annual'>('monthly')
  const [selectedMonth, setSelectedMonth] = useState(getDefaultMonth)

  // Monthly state
  const [rows, setRows] = useState<PlanRow[]>([])
  const [totals, setTotals] = useState<MonthlyTotals | null>(null)
  const [loadingMonthly, setLoadingMonthly] = useState(false)

  // Annual state
  const [annualSummary, setAnnualSummary] = useState<AnnualSummaryRow[]>([])
  const [categoryRows, setCategoryRows] = useState<CategoryAnnualRow[]>([])
  const [annualMonths, setAnnualMonths] = useState<string[]>([])
  const [loadingAnnual, setLoadingAnnual] = useState(false)

  // Expand/collapse groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['Income', 'Expenses', 'Expense_Life', 'Expense_Health', 'Expense_Travels', 'Expense_Others'])
  )

  // Category catalog (for the Add Plan Item modal)
  const [categories, setCategories] = useState<CategoryDef[]>([])

  useEffect(() => {
    fetch('/api/data-source')
      .then(r => r.json())
      .then(data => setCategories(data.categories || []))
      .catch(console.error)
  }, [])

  // Add Plan Item modal
  const [showAddModal, setShowAddModal] = useState(false)

  // CSV import
  const csvInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  // ── Load monthly data ──────────────────────────────────────────────────────
  const loadMonthly = useCallback(async (month: string) => {
    setLoadingMonthly(true)
    try {
      const res = await fetch(`/api/plan?month=${month}`)
      const data = await res.json()
      setRows(data.rows || [])
      setTotals(data.totals || null)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingMonthly(false)
    }
  }, [])

  // ── Load annual data ───────────────────────────────────────────────────────
  const loadAnnual = useCallback(async () => {
    setLoadingAnnual(true)
    try {
      const res = await fetch('/api/plan?view=annual')
      const data = await res.json()
      setAnnualSummary(data.annualSummary || [])
      setCategoryRows(data.categoryRows || [])
      setAnnualMonths(data.months || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingAnnual(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'monthly') loadMonthly(selectedMonth)
    if (tab === 'annual' && annualSummary.length === 0) loadAnnual()
  }, [tab, selectedMonth, loadMonthly, loadAnnual, annualSummary.length])

  // ── Update plan ────────────────────────────────────────────────────────────
  const updatePlan = async (id: number, newPlan: number) => {
    await fetch('/api/plan', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, plan: newPlan }),
    })
    await loadMonthly(selectedMonth)
  }

  // Re-fetch both views after a create/bulk-import, bypassing the annual cache guard.
  const refreshAll = useCallback(async () => {
    await Promise.all([loadMonthly(selectedMonth), loadAnnual()])
  }, [selectedMonth, loadMonthly, loadAnnual])

  // ── CSV export ──────────────────────────────────────────────────────────────
  const exportCSV = async () => {
    const res = await fetch('/api/plan/export')
    if (!res.ok) { alert('Export failed'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'plan_structure_2026.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── CSV import ──────────────────────────────────────────────────────────────
  const importCSV = async (file: File) => {
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) return

    const headers = lines[0].split(',').map(h => h.trim())
    const parsedRows = lines.slice(1).map(line => {
      const values: string[] = []
      let current = ''
      let inQuotes = false
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; continue }
        if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue }
        current += char
      }
      values.push(current.trim())

      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = values[i] || '' })
      return {
        month_label: obj.month_label || '',
        event_type: obj.event_type || '',
        level_2: obj.level_2 || '',
        level_3: obj.level_3 || null,
        plan: obj.plan || '0',
        currency: obj.currency || 'COP',
      }
    }).filter(r => r.month_label && r.event_type && r.level_2)

    if (parsedRows.length === 0) return

    setImporting(true)
    try {
      const res = await fetch('/api/plan/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedRows }),
      })
      const data = await res.json()
      if (data.updated > 0) await refreshAll()
      alert(`Updated ${data.updated} of ${parsedRows.length} rows.${data.errors?.length ? '\n\nErrors:\n' + data.errors.slice(0, 20).join('\n') + (data.errors.length > 20 ? `\n…and ${data.errors.length - 20} more` : '') : ''}`)
    } catch (err) {
      alert('Import failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setImporting(false)
    }
  }

  // ── Group rows ─────────────────────────────────────────────────────────────
  // Every row is converted into the globally chosen display currency before
  // being summed — a group can freely mix native-COP and native-USD rows.
  const toDisplay = (value: number, nativeCurrency: Currency, month: string) => convert(value, nativeCurrency, month)

  // Merge the API's COP/USD-split totals into one number in the display currency.
  const mergedTotal = (t: MonthlyTotals | null, field: keyof CurrencyTotals, month: string): number => {
    if (!t) return 0
    return toDisplay(t.COP[field], 'COP', month) + toDisplay(t.USD[field], 'USD', month)
  }

  const incomeRows = rows.filter(r => r.event_type === 'Income')
  const EXPENSE_ORDER = ['Life', 'Health', 'Travels', 'Others']

  const expenseByL2Raw = rows
    .filter(r => r.event_type === 'Expense')
    .reduce((acc, r) => {
      const key = r.level_2
      if (!acc[key]) acc[key] = []
      acc[key].push(r)
      return acc
    }, {} as Record<string, PlanRow[]>)

  // Sort entries by EXPENSE_ORDER, unknown categories go last
  const expenseByL2 = Object.fromEntries(
    [...Object.entries(expenseByL2Raw)].sort(([a], [b]) => {
      const ai = EXPENSE_ORDER.indexOf(a)
      const bi = EXPENSE_ORDER.indexOf(b)
      if (ai === -1 && bi === -1) return a.localeCompare(b)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  )

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
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
    // Rows are transparent over the page's own bg-base, so a sticky header
    // using that same color had no visible seam from the content scrolling
    // under it — during a scroll it read as "floating and blending in"
    // rather than clearly pinned. bg-elevated + a shadow make the frozen
    // header visually distinct from the scrolling rows.
    background: 'var(--bg-elevated)',
    zIndex: 10,
    borderBottom: '1px solid var(--border-strong)',
    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
    whiteSpace: 'nowrap',
  })

  const tdStyle = (align: 'left' | 'right' = 'right'): React.CSSProperties => ({
    padding: '10px 16px',
    fontSize: '12px',
    textAlign: align,
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  })

  const monthLabel = (MONTHS.find(m => m.key === selectedMonth)?.label || '') + ' 2026'

  // ── Annual category filter ─────────────────────────────────────────────────
  const [annualFilter, setAnnualFilter] = useState<'all' | 'Income' | 'Expense'>('all')
  const filteredCategoryRows = annualFilter === 'all'
    ? categoryRows
    : categoryRows.filter(r => r.eventType === annualFilter)

  // Merge a month's COP/USD-split annual summary into the display currency.
  const mergedAnnual = (row: AnnualSummaryRow, field: keyof AnnualCurrencySummary): number =>
    toDisplay(row.COP[field], 'COP', row.month) + toDisplay(row.USD[field], 'USD', row.month)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>

      {/* Hidden CSV file input */}
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={e => {
          if (e.target.files?.[0]) importCSV(e.target.files[0])
          e.target.value = ''
        }}
      />

      {/* Add Plan Item modal */}
      {showAddModal && (
        <AddPlanItemModal
          categories={categories}
          onClose={() => setShowAddModal(false)}
          onSaved={refreshAll}
        />
      )}

      {/* Header */}
      <div style={{
        padding: '24px 32px 0',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div className="header-row" style={{ alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Plan vs Real
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {tab === 'monthly' ? monthLabel : 'Full year 2026'}
            </p>
          </div>
          <div className="header-row-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={exportCSV}
              style={{
                padding: '8px 14px', background: 'transparent', color: 'var(--text-secondary)',
                border: '1px solid var(--border-strong)', borderRadius: '8px',
                fontSize: '13px', fontWeight: 500, cursor: 'pointer',
              }}
            >
              Export CSV
            </button>
            <button
              onClick={() => csvInputRef.current?.click()}
              disabled={importing}
              style={{
                padding: '8px 14px', background: 'transparent', color: 'var(--text-secondary)',
                border: '1px solid var(--border-strong)', borderRadius: '8px',
                fontSize: '13px', fontWeight: 500, cursor: importing ? 'wait' : 'pointer',
              }}
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', background: 'var(--accent)', color: '#ffffff',
                border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              + Add Plan Item
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0' }}>
          {(['monthly', 'annual'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '10px 20px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
                color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
                marginBottom: '-1px',
              }}
            >
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
            display: 'flex',
            gap: '4px',
            overflowX: 'auto',
            flexShrink: 0,
          }}>
            {MONTHS.map(m => (
              <button
                key={m.key}
                onClick={() => setSelectedMonth(m.key)}
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  borderRadius: '6px',
                  whiteSpace: 'nowrap',
                  border: selectedMonth === m.key
                    ? '1px solid var(--border-strong)'
                    : '1px solid transparent',
                  background: selectedMonth === m.key ? 'var(--bg-base)' : 'transparent',
                  color: 'var(--text-primary)',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Summary cards — COP and USD rows merged into the display currency */}
          {totals && (
            <div className="g-4" style={{
              padding: '16px 32px',
              borderBottom: '1px solid var(--border)',
              gap: '12px',
              flexShrink: 0,
            }}>
              {[
                { label: 'Income Plan', value: mergedTotal(totals, 'income_plan', selectedMonth) },
                { label: 'Income Executed', value: mergedTotal(totals, 'income_exec', selectedMonth) },
                { label: 'Expense Plan', value: mergedTotal(totals, 'expense_plan', selectedMonth) },
                { label: 'Expense Executed', value: mergedTotal(totals, 'expense_exec', selectedMonth) },
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
                    {formatMoney(card.value, displayCurrency)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          <div className="page-body" style={{ flex: 1, overflowY: 'auto' }}>
            {loadingMonthly ? (
              <div style={{ padding: '60px', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-primary)', fontSize: '13px' }}>Loading…</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: '700px' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle('left'), paddingLeft: '32px', width: '280px' }}>Category</th>
                    <th style={thStyle()}>Plan</th>
                    <th style={thStyle()}>Executed</th>
                    <th style={thStyle()}>Difference</th>
                    <th style={{ ...thStyle(), width: '120px' }}>Variance %</th>
                  </tr>
                </thead>
                <tbody>

                  {/* ── INCOME GROUP ─────────────────────────────────────── */}
                  <tr
                    onClick={() => toggleGroup('Income')}
                    style={{ cursor: 'pointer', background: 'var(--bg-surface)' }}
                  >
                    <td style={{
                      padding: '10px 16px 10px 32px',
                      fontSize: '11px', fontWeight: 700,
                      color: 'var(--text-primary)',
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      {expandedGroups.has('Income') ? '▾' : '▸'} Income
                    </td>
                    <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {formatMoney(incomeRows.reduce((s, r) => s + toDisplay(r.plan, r.currency, r.month_label), 0), displayCurrency)}
                    </td>
                    <td style={{ ...tdStyle(), fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatMoney(incomeRows.reduce((s, r) => s + toDisplay(r.executed, r.currency, r.month_label), 0), displayCurrency)}
                    </td>
                    <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {(() => {
                        const diff = incomeRows.reduce((s, r) => s + toDisplay(r.diff, r.currency, r.month_label), 0)
                        return `${diff >= 0 ? '+' : ''}${formatMoney(diff, displayCurrency)}`
                      })()}
                    </td>
                    <td style={{ ...tdStyle(), fontVariantNumeric: 'tabular-nums' }}>
                      {(() => {
                        const totalPlan = incomeRows.reduce((s, r) => s + toDisplay(r.plan, r.currency, r.month_label), 0)
                        const totalExec = incomeRows.reduce((s, r) => s + toDisplay(r.executed, r.currency, r.month_label), 0)
                        const v = formatVariance(totalExec - totalPlan, totalPlan, 'Income')
                        return <span style={{ fontSize: '12px', fontWeight: 600, color: v.color }}>{v.text}</span>
                      })()}
                    </td>
                  </tr>

                  {expandedGroups.has('Income') && incomeRows.map(row => (
                    <tr
                      key={row.id}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <td style={{ ...tdStyle('left'), paddingLeft: '48px', color: 'var(--text-primary)' }}>
                        {row.level_2}
                        {row.level_3 && <span style={{ color: 'var(--text-primary)', marginLeft: '6px' }}>· {row.level_3}</span>}
                      </td>
                      <td style={tdStyle()}>
                        <EditableAmount value={row.plan} nativeCurrency={row.currency} month={row.month_label} onSave={v => updatePlan(row.id, v)} />
                      </td>
                      <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {formatMoney(toDisplay(row.executed, row.currency, row.month_label), displayCurrency)}
                      </td>
                      <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {`${row.diff >= 0 ? '+' : ''}${formatMoney(toDisplay(row.diff, row.currency, row.month_label), displayCurrency)}`}
                      </td>
                      <td style={{ ...tdStyle(), fontVariantNumeric: 'tabular-nums' }}>
                        {(() => {
                          const v = formatVariance(row.diff, row.plan, row.event_type)
                          return <span style={{ fontSize: '12px', fontWeight: 600, color: v.color }}>{v.text}</span>
                        })()}
                      </td>
                    </tr>
                  ))}

                  {/* ── EXPENSES WRAPPER ─────────────────────────────────── */}
                  <tr
                    onClick={() => toggleGroup('Expenses')}
                    style={{ cursor: 'pointer', background: 'var(--bg-surface)' }}
                  >
                    <td style={{
                      padding: '10px 16px 10px 32px',
                      fontSize: '11px', fontWeight: 700,
                      color: 'var(--text-primary)',
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      borderBottom: '1px solid var(--border)',
                      borderTop: '2px solid var(--border-strong)',
                    }}>
                      {expandedGroups.has('Expenses') ? '▾' : '▸'} Expenses
                    </td>
                    <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', borderTop: '2px solid var(--border-strong)' }}>
                      {totals ? formatMoney(mergedTotal(totals, 'expense_plan', selectedMonth), displayCurrency) : '—'}
                    </td>
                    <td style={{ ...tdStyle(), fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', borderTop: '2px solid var(--border-strong)' }}>
                      {totals ? formatMoney(mergedTotal(totals, 'expense_exec', selectedMonth), displayCurrency) : '—'}
                    </td>
                    <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', borderTop: '2px solid var(--border-strong)' }}>
                      {totals ? (() => {
                        const diff = mergedTotal(totals, 'expense_exec', selectedMonth) - mergedTotal(totals, 'expense_plan', selectedMonth)
                        return `${diff >= 0 ? '+' : ''}${formatMoney(diff, displayCurrency)}`
                      })() : '—'}
                    </td>
                    <td style={{ ...tdStyle(), fontVariantNumeric: 'tabular-nums', borderTop: '2px solid var(--border-strong)' }}>
                      {totals && (() => {
                        const exec = mergedTotal(totals, 'expense_exec', selectedMonth)
                        const plan = mergedTotal(totals, 'expense_plan', selectedMonth)
                        const v = formatVariance(exec - plan, plan, 'Expense')
                        return <span style={{ fontSize: '12px', fontWeight: 600, color: v.color }}>{v.text}</span>
                      })()}
                    </td>
                  </tr>

                  {/* ── EXPENSE SUBCATEGORIES (all Level 2 groups present in this user's data) */}
                  {expandedGroups.has('Expenses') && Object.keys(expenseByL2).map(l2 => {
                    const l2rows = expenseByL2[l2]
                    const groupKey = `Expense_${l2}`
                    const isExpanded = expandedGroups.has(groupKey)
                    const groupPlan = l2rows.reduce((s, r) => s + toDisplay(r.plan, r.currency, r.month_label), 0)
                    const groupExec = l2rows.reduce((s, r) => s + toDisplay(r.executed, r.currency, r.month_label), 0)
                    const groupDiff = groupExec - groupPlan

                    return [
                      // Subcategory header
                      <tr
                        key={`header_${l2}`}
                        onClick={() => toggleGroup(groupKey)}
                        style={{ cursor: 'pointer', background: 'var(--bg-elevated)' }}
                      >
                        <td style={{
                          padding: '10px 16px 10px 48px',
                          fontSize: '11px', fontWeight: 600,
                          color: 'var(--text-primary)',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          borderBottom: '1px solid var(--border)',
                        }}>
                          {isExpanded ? '▾' : '▸'} {l2}
                        </td>
                        <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {formatMoney(groupPlan, displayCurrency)}
                        </td>
                        <td style={{ ...tdStyle(), fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatMoney(groupExec, displayCurrency)}
                        </td>
                        <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                          {`${groupDiff >= 0 ? '+' : ''}${formatMoney(groupDiff, displayCurrency)}`}
                        </td>
                        <td style={{ ...tdStyle(), fontVariantNumeric: 'tabular-nums' }}>
                          {(() => {
                            const v = formatVariance(groupDiff, groupPlan, 'Expense')
                            return <span style={{ fontSize: '12px', fontWeight: 600, color: v.color }}>{v.text}</span>
                          })()}
                        </td>
                      </tr>,

                      // Individual rows
                      ...(isExpanded ? l2rows.map(row => (
                        <tr
                          key={row.id}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        >
                          <td style={{ ...tdStyle('left'), paddingLeft: '64px', color: 'var(--text-primary)' }}>
                            {row.level_3 || row.level_2}
                          </td>
                          <td style={tdStyle()}>
                            <EditableAmount value={row.plan} nativeCurrency={row.currency} month={row.month_label} onSave={v => updatePlan(row.id, v)} />
                          </td>
                          <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                            {formatMoney(toDisplay(row.executed, row.currency, row.month_label), displayCurrency)}
                          </td>
                          <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                            {`${row.diff >= 0 ? '+' : ''}${formatMoney(toDisplay(row.diff, row.currency, row.month_label), displayCurrency)}`}
                          </td>
                          <td style={{ ...tdStyle(), fontVariantNumeric: 'tabular-nums' }}>
                            {(() => {
                              const v = formatVariance(row.diff, row.plan, row.event_type)
                              return <span style={{ fontSize: '12px', fontWeight: 600, color: v.color }}>{v.text}</span>
                            })()}
                          </td>
                        </tr>
                      )) : []),
                    ]
                  })}

                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── ANNUAL TAB ────────────────────────────────────────────────────── */}
      {tab === 'annual' && (
        <div className="page-body" style={{ flex: 1, overflowY: 'auto' }}>
          {loadingAnnual ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-primary)', fontSize: '13px' }}>Loading…</p>
            </div>
          ) : (
            <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Annual cashflow summary table */}
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                overflow: 'hidden',
              }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Cashflow Summary ({displayCurrency})
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-primary)', marginTop: '2px' }}>
                    Plan vs Executed by month · Double row: Plan / Executed
                  </p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: '900px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ ...thStyle('left'), paddingLeft: '20px', width: '130px' }}>Metric</th>
                        {annualMonths.map(m => (
                          <th key={m} style={thStyle()}>{MONTH_SHORT[m] || m}</th>
                        ))}
                        <th style={thStyle()}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        { label: 'Income', key: 'income' as const },
                        { label: 'Expense', key: 'expense' as const },
                        { label: 'Balance', key: 'balance' as const },
                        { label: 'Savings %', key: 'savings' as const },
                      ]).map(({ label, key }) => {
                        const isRate = key === 'savings'

                        // Savings % is a ratio, not money — it can't be summed across
                        // currencies like an amount can. Recompute it from the
                        // already-merged income/balance instead of merging raw rates.
                        const getVal = (row: AnnualSummaryRow, phase: 'plan' | 'exec') => {
                          if (key === 'savings') {
                            const income = mergedAnnual(row, `income_${phase}`)
                            const balance = mergedAnnual(row, `balance_${phase}`)
                            return income > 0 ? balance / income : 0
                          }
                          return mergedAnnual(row, `${key}_${phase}`)
                        }

                        const totalPlan = isRate ? 0 : annualSummary.reduce((s, r) => s + getVal(r, 'plan'), 0)
                        const totalExec = isRate ? 0 : annualSummary.reduce((s, r) => s + getVal(r, 'exec'), 0)

                        return [
                          // Plan row
                          <tr key={`${label}_plan`} style={{ borderBottom: 'none' }}>
                            <td style={{ padding: '8px 16px 2px 20px', fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {label}
                              <span style={{ marginLeft: '6px', fontSize: '9px', color: 'var(--text-primary)', fontWeight: 400 }}>plan</span>
                            </td>
                            {annualSummary.map(row => (
                              <td key={row.month} style={{ padding: '8px 16px 2px', fontSize: '11px', textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                {isRate
                                  ? formatAchievementPct(getVal(row, 'plan'))
                                  : formatMoney(getVal(row, 'plan'), displayCurrency)}
                              </td>
                            ))}
                            <td style={{ padding: '8px 16px 2px', fontSize: '11px', textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                              {isRate ? '—' : formatMoney(totalPlan, displayCurrency)}
                            </td>
                          </tr>,
                          // Exec row
                          <tr key={`${label}_exec`} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '2px 16px 10px 20px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }} />
                            {annualSummary.map(row => {
                              const val = getVal(row, 'exec')
                              return (
                                <td key={row.month} style={{
                                  padding: '2px 16px 10px',
                                  fontSize: '13px',
                                  fontWeight: 700,
                                  textAlign: 'right',
                                  color: 'var(--text-primary)',
                                  fontVariantNumeric: 'tabular-nums',
                                }}>
                                  {isRate
                                    ? formatAchievementPct(val)
                                    : formatMoney(val, displayCurrency)}
                                </td>
                              )
                            })}
                            <td style={{ padding: '2px 16px 10px', fontSize: '13px', fontWeight: 700, textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                              {isRate ? '—' : formatMoney(totalExec, displayCurrency)}
                            </td>
                          </tr>,
                        ]
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Category breakdown annual table */}
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
                    Category Breakdown
                  </p>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['all', 'Income', 'Expense'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setAnnualFilter(f)}
                        style={{
                          padding: '4px 12px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          border: annualFilter === f ? '1px solid var(--border-strong)' : '1px solid transparent',
                          background: annualFilter === f ? 'var(--bg-elevated)' : 'transparent',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {f === 'all' ? 'All' : f}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: '900px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ ...thStyle('left'), paddingLeft: '20px', width: '200px' }}>Category</th>
                        {annualMonths.map(m => (
                          <th key={m} style={thStyle()}>{MONTH_SHORT[m] || m}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCategoryRows.map((cat, i) => (
                        <tr
                          key={i}
                          style={{ borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        >
                          <td style={{ padding: '10px 16px 10px 20px', fontSize: '12px', color: 'var(--text-primary)' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-primary)', marginRight: '6px', textTransform: 'uppercase' }}>
                              {cat.eventType === 'Income' ? '↑' : '↓'}
                            </span>
                            {cat.level_2}
                            {cat.level_3 && (
                              <span style={{ color: 'var(--text-primary)', marginLeft: '4px' }}>· {cat.level_3}</span>
                            )}
                          </td>
                          {cat.months.map(m => (
                            <td key={m.month} style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {m.exec === 0 && m.plan === 0 ? (
                                <span style={{ color: 'var(--text-primary)', fontSize: '11px' }}>—</span>
                              ) : (
                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {formatMoney(toDisplay(m.exec, cat.currency, m.month), displayCurrency)}
                                  </div>
                                  {m.plan > 0 && (
                                    <div style={{ fontSize: '10px', color: 'var(--text-primary)', marginTop: '1px' }}>
                                      {formatAchievementPct(m.achievement)}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          ))}
                        </tr>
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
