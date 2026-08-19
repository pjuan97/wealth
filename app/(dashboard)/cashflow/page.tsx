'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { useCurrencyPreference } from '@/app/components/CurrencyPreferenceProvider'

// ─── Types ────────────────────────────────────────────────────────────────────
interface MonthData {
  month: string
  plan: number
  executed: number
  diff: number
  variance: number | null
  planId: number | null
}

interface CategoryRow {
  eventType: string
  level_2: string
  level_3: string | null
  currency: 'COP' | 'USD'
  months: MonthData[]
  total: { plan: number; executed: number; diff: number; variance: number | null }
}

interface CurrencyMonthData {
  openingBalance: number
  incomePlan: number
  incomeExec: number
  expensePlan: number
  expenseExec: number
  resultadoPlan: number
  resultadoExec: number
  balancePlan: number
  balanceExec: number
}

interface MonthlySummary {
  month: string
  isPast: boolean
  isCurrent: boolean
  isFuture: boolean
  fx: number
  COP: CurrencyMonthData
  USD: CurrencyMonthData
}

interface ComputedSummary extends CurrencyMonthData {
  month: string
  isPast: boolean
  isCurrent: boolean
  isFuture: boolean
  balanceEffective: number
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = [
  '2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
  '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12',
]
const MONTH_SHORT: Record<string, string> = {
  '2026-01':'Jan','2026-02':'Feb','2026-03':'Mar','2026-04':'Apr',
  '2026-05':'May','2026-06':'Jun','2026-07':'Jul','2026-08':'Aug',
  '2026-09':'Sep','2026-10':'Oct','2026-11':'Nov','2026-12':'Dec',
}

function getCurrentMonth(): string {
  const todayKey = new Date().toISOString().slice(0, 7)
  if (MONTHS.includes(todayKey)) return todayKey
  return todayKey < MONTHS[0] ? MONTHS[0] : MONTHS[MONTHS.length - 1]
}
const CURRENT_MONTH = getCurrentMonth()

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Formats an already-converted number for display in the given currency.
function fM(n: number, currency: 'COP' | 'USD'): string {
  if (n === 0) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (currency === 'USD') {
    if (abs >= 1000) return `${sign}${(abs/1000).toFixed(1)}K`
    return `${sign}${abs.toFixed(0)}`
  }
  if (abs >= 1_000_000) return `${sign}${(abs/1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}${(abs/1_000).toFixed(0)}K`
  return `${sign}${abs.toFixed(0)}`
}

function fVar(v: number | null, type: 'income' | 'expense'): { text: string; color: string } {
  if (v === null) return { text: '—', color: 'var(--text-muted)' }
  const pct = v * 100
  const text = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
  const isGood = type === 'income' ? pct >= 0 : pct <= 0
  if (Math.abs(pct) <= 5) return { text, color: 'var(--text-primary)' }
  return { text, color: isGood ? 'var(--accent)' : 'var(--text-secondary)' }
}

function isFuture(m: string) { return m > CURRENT_MONTH }
function isCurrent(m: string) { return m === CURRENT_MONTH }

// ─── Account Selector Modal ───────────────────────────────────────────────────
function AccountSelectorModal({
  accounts,
  selected,
  onSave,
  onClose,
}: {
  accounts: string[]
  selected: string[]
  onSave: (selected: string[]) => void
  onClose: () => void
}) {
  const [local, setLocal] = useState<string[]>(selected)

  const toggle = (acc: string) => {
    setLocal(prev => prev.includes(acc) ? prev.filter(a => a !== acc) : [...prev, acc])
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div className="modal-box" style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
        borderRadius: '14px', padding: '28px 32px', width: '400px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
          Opening Balance Accounts
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
          Select which cash accounts to include in the Opening Balance calculation
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
          {accounts.map(acc => (
            <div
              key={acc}
              onClick={() => toggle(acc)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 14px', borderRadius: '8px', cursor: 'pointer',
                border: local.includes(acc) ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                background: local.includes(acc) ? 'var(--accent-subtle)' : 'transparent',
              }}
            >
              <div style={{
                width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0,
                border: local.includes(acc) ? 'none' : '2px solid var(--border-strong)',
                background: local.includes(acc) ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {local.includes(acc) && <span style={{ color: '#fff', fontSize: '11px' }}>✓</span>}
              </div>
              <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                {acc}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
            background: 'transparent', border: '1px solid var(--border-strong)',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={() => onSave(local)} style={{
            padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
          }}>Apply</button>
        </div>
      </div>
    </div>
  )
}

// ─── Save Changes Modal ───────────────────────────────────────────────────────
function SaveChangesModal({
  count,
  onSave,
  onDiscard,
  onCancel,
}: {
  count: number
  onSave: () => Promise<void>
  onDiscard: () => void
  onCancel: () => void
}) {
  const [saving, setSaving] = useState(false)
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div className="modal-box" style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
        borderRadius: '14px', padding: '28px 32px', width: '420px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
          Unsaved Changes
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
          You have <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{count} modified plan values</span>.
          Save them to Plan vs Real or discard?
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
            background: 'transparent', border: '1px solid var(--border-strong)',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={onDiscard} style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
            color: 'var(--text-primary)', cursor: 'pointer',
          }}>Discard</button>
          <button onClick={async () => { setSaving(true); await onSave(); setSaving(false) }} style={{
            padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
          }}>
            {saving ? 'Saving…' : 'Save to Plan vs Real'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Editable Plan Cell ───────────────────────────────────────────────────────
// Displays and edits in the globally chosen display currency, converting
// to/from the row's real native currency for storage.
function EditablePlanCell({
  value,
  month,
  nativeCurrency,
  onChange,
}: {
  value: number
  month: string
  nativeCurrency: 'COP' | 'USD'
  onChange: (v: number) => void
}) {
  const { displayCurrency, convert, convertToNative } = useCurrencyPreference()
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')

  const displayVal = convert(value, nativeCurrency, month)

  const handleSave = () => {
    const cleaned = raw.replace(/[^0-9.]/g, '')
    const num = parseFloat(cleaned)
    if (!isNaN(num)) {
      onChange(convertToNative(num, nativeCurrency, month))
    }
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
          width: '80px', background: 'var(--bg-elevated)',
          border: '1px solid var(--accent-border)', borderRadius: '4px',
          padding: '2px 6px', color: 'var(--text-primary)', fontSize: '11px',
          outline: 'none', textAlign: 'right',
        }}
      />
    )
  }

  return (
    <span
      onDoubleClick={() => {
        setRaw(displayVal === 0 ? '' : displayVal.toFixed(displayCurrency === 'USD' ? 2 : 0))
        setEditing(true)
      }}
      title="Double-click to edit plan"
      style={{
        cursor: 'text', fontSize: '11px',
        color: 'var(--text-secondary)',
        fontVariantNumeric: 'tabular-nums',
        borderBottom: isFuture(month) ? '1px dashed var(--border-strong)' : 'none',
        paddingBottom: '1px',
        display: 'block', textAlign: 'right',
      }}
    >
      {fM(displayVal, displayCurrency)}
    </span>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CashflowPage() {
  const { displayCurrency, convert } = useCurrencyPreference()
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([])
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([])
  const [cashAccounts, setCashAccounts] = useState<string[]>([])
  // Empty by default — the API fills in this user's own active cash accounts
  // when no explicit selection is sent (see load() below).
  const [openingAccounts, setOpeningAccounts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['Income', 'Expense_Life', 'Expense_Health', 'Expense_Travels', 'Expense_Others'])
  )
  const [showAccountSelector, setShowAccountSelector] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)

  // Simulation state: overridden plan values (key: `${level_2}||${level_3}||${month}`)
  const [planOverrides, setPlanOverrides] = useState<Record<string, number>>({})
  const [originalPlans, setOriginalPlans] = useState<Record<string, { planId: number; value: number }>>({})
  const hasUnsavedChanges = Object.keys(planOverrides).length > 0

  const load = useCallback(async (accounts?: string[]) => {
    setLoading(true)
    try {
      const accs = accounts || openingAccounts
      const params = new URLSearchParams()
      if (accs.length) params.set('openingAccounts', accs.join(','))
      const res = await fetch(`/api/cashflow?${params}`)
      const data = await res.json()
      const rows: CategoryRow[] = data.categoryRows || []
      setCategoryRows(rows)
      setMonthlySummary(data.monthlySummary || [])
      setCashAccounts(data.cashAccounts || [])
      setOpeningAccounts(data.openingAccounts || accs)

      // Build original plans map
      const orig: Record<string, { planId: number; value: number }> = {}
      for (const row of (data.categoryRows || [])) {
        for (const m of row.months) {
          if (m.planId) {
            const key = `${row.level_2}||${row.level_3 || ''}||${m.month}`
            orig[key] = { planId: m.planId, value: m.plan }
          }
        }
      }
      setOriginalPlans(orig)
      setPlanOverrides({}) // clear overrides on reload
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [openingAccounts])

  useEffect(() => { load() }, [])

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Get effective plan value (override or original)
  const getPlanValue = useCallback((level_2: string, level_3: string | null, month: string, originalValue: number): number => {
    const key = `${level_2}||${level_3 || ''}||${month}`
    return key in planOverrides ? planOverrides[key] : originalValue
  }, [planOverrides])

  // Set plan override
  const setPlan = (level_2: string, level_3: string | null, month: string, value: number) => {
    const key = `${level_2}||${level_3 || ''}||${month}`
    setPlanOverrides(prev => ({ ...prev, [key]: value }))
  }

  // A row's `total.executed` is a pre-summed 12-month figure in its native
  // currency — converting it with one blanket rate would be wrong, so instead
  // sum each month's own converted value using that month's own TRM.
  const rowTotalDisplay = useCallback((row: CategoryRow) =>
    row.months.reduce((s, md) => s + convert(md.executed, row.currency, md.month), 0),
  [convert])

  // Compute rolling cashflow with overrides applied (iterative to avoid circular ref)
  const computedSummary: ComputedSummary[] = useMemo(() => {
    if (!monthlySummary.length) {
      return []
    }

    // Every row (any native currency) contributes — each is converted into
    // the display currency before summing.
    const incRows = categoryRows.filter(r => r.eventType === 'Income')
    const expRows = categoryRows.filter(r => r.eventType === 'Expense')

    const result: ComputedSummary[] = []

    for (let i = 0; i < monthlySummary.length; i++) {
      const ms = monthlySummary[i]
      const m = ms.month

      const incomePlan = incRows.reduce((s, r) => {
        const mData = r.months.find(x => x.month === m)
        const native = getPlanValue(r.level_2, r.level_3, m, mData?.plan || 0)
        return s + convert(native, r.currency, m)
      }, 0)

      const expensePlan = expRows.reduce((s, r) => {
        const mData = r.months.find(x => x.month === m)
        const native = getPlanValue(r.level_2, r.level_3, m, mData?.plan || 0)
        return s + convert(native, r.currency, m)
      }, 0)

      const incomeExec = convert(ms.COP.incomeExec, 'COP', m) + convert(ms.USD.incomeExec, 'USD', m)
      const expenseExec = convert(ms.COP.expenseExec, 'COP', m) + convert(ms.USD.expenseExec, 'USD', m)
      const resultadoPlan = incomePlan - expensePlan
      const resultadoExec = incomeExec - expenseExec

      // Opening balance: first month from API, rest from previous month's effective balance
      const openingBalance = i === 0
        ? convert(ms.COP.openingBalance, 'COP', m) + convert(ms.USD.openingBalance, 'USD', m)
        : result[i - 1].balanceEffective

      const balancePlan = openingBalance + resultadoPlan
      const balanceExec = openingBalance + resultadoExec
      const balanceEffective = (ms.isPast || ms.isCurrent) ? balanceExec : balancePlan

      result.push({
        month: ms.month,
        isPast: ms.isPast,
        isCurrent: ms.isCurrent,
        isFuture: ms.isFuture,
        openingBalance,
        incomePlan,
        incomeExec,
        expensePlan,
        expenseExec,
        resultadoPlan,
        resultadoExec,
        balancePlan,
        balanceExec,
        balanceEffective,
      })
    }

    return result
  }, [monthlySummary, categoryRows, getPlanValue, convert])

  // Save changes to DB
  const saveChanges = async () => {
    const updates = Object.entries(planOverrides).map(([key, value]) => {
      const orig = originalPlans[key]
      return orig ? { planId: orig.planId, value } : null
    }).filter(Boolean)

    if (updates.length === 0) return

    await fetch('/api/cashflow', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })

    setPlanOverrides({})
    await load()
  }

  const discardChanges = () => {
    setPlanOverrides({})
    setShowSaveModal(false)
  }

  // Group data — every row shows regardless of its native currency; each
  // value is converted into the global display currency at render time.
  const incomeRows = categoryRows.filter(r => r.eventType === 'Income')
  const expenseByL2: Record<string, CategoryRow[]> = {}
  categoryRows.filter(r => r.eventType === 'Expense').forEach(r => {
    if (!expenseByL2[r.level_2]) expenseByL2[r.level_2] = []
    expenseByL2[r.level_2].push(r)
  })

  // ── Column styles ──────────────────────────────────────────────────────────
  const COL_W = '90px'

  // Rows here are transparent/bg-base by default, so a sticky header sharing
  // that same color had no visible seam from content scrolling underneath —
  // it read as "floating and blending in" rather than clearly pinned.
  // bg-elevated + a shadow anchor it as visually distinct.
  const monthHeaderStyle = (m: string): React.CSSProperties => ({
    padding: '6px 0', fontSize: '10px',
    fontWeight: isCurrent(m) ? 800 : 600,
    color: isCurrent(m) ? 'var(--accent)' : isFuture(m) ? 'var(--text-muted)' : 'var(--text-secondary)',
    textAlign: 'center',
    borderBottom: '1px solid var(--border-strong)',
    background: isCurrent(m) ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
    position: 'sticky', top: 0, zIndex: 10, whiteSpace: 'nowrap',
    borderLeft: isCurrent(m) ? '1px solid var(--accent-border)' : 'none',
    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
  })

  const subHeaderStyle = (m: string): React.CSSProperties => ({
    padding: '4px 6px', fontSize: '9px', fontWeight: 600,
    color: isCurrent(m) ? 'var(--accent)' : 'var(--text-muted)',
    textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: '1px solid var(--border-strong)',
    background: isCurrent(m) ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
    position: 'sticky', top: '28px', zIndex: 9,
    width: COL_W, minWidth: COL_W, maxWidth: COL_W,
    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
  })

  const cellStyle = (m: string): React.CSSProperties => ({
    padding: '8px 6px', fontSize: '11px',
    color: isFuture(m) ? 'var(--text-secondary)' : 'var(--text-primary)',
    textAlign: 'right',
    borderBottom: '1px solid var(--border)',
    fontVariantNumeric: 'tabular-nums',
    width: COL_W, minWidth: COL_W, maxWidth: COL_W,
    background: isCurrent(m) ? 'rgba(249,115,22,0.04)' : 'transparent',
    borderLeft: isCurrent(m) ? '1px solid var(--accent-border)' : 'none',
  })

  const stickyLabel = (indent = 0, bold = false, bg = 'var(--bg-base)'): React.CSSProperties => ({
    padding: `9px 16px 9px ${16 + indent * 16}px`,
    fontSize: indent > 0 ? '12px' : '11px',
    fontWeight: bold ? 700 : indent > 1 ? 400 : 600,
    color: 'var(--text-primary)',
    textTransform: indent === 0 ? 'uppercase' : 'none',
    letterSpacing: indent === 0 ? '0.06em' : 'normal',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
    position: 'sticky', left: 0, zIndex: 8,
    background: bg, minWidth: '200px', maxWidth: '200px',
  })

  const totalCell: React.CSSProperties = {
    padding: '8px 10px', fontSize: '11px', fontWeight: 700,
    color: 'var(--text-primary)', textAlign: 'right',
    borderBottom: '1px solid var(--border)',
    fontVariantNumeric: 'tabular-nums', width: '100px', minWidth: '100px',
    background: 'var(--bg-surface)', position: 'sticky', right: 0, zIndex: 5,
    borderLeft: '1px solid var(--border)',
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading cashflow…</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>

      {/* Header */}
      <div className="header-row" style={{
        padding: '20px 32px 16px', borderBottom: '1px solid var(--border)',
        flexShrink: 0, alignItems: 'flex-start',
      }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Cashflow
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Plan vs Ejecutado · 2026 · Rolling Opening Balance
          </p>
        </div>
        <div className="header-row-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>

          {/* Unsaved indicator */}
          {hasUnsavedChanges && (
            <div style={{
              padding: '4px 12px', borderRadius: '6px', fontSize: '11px',
              background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)',
              color: 'var(--accent)', fontWeight: 600,
            }}>
              {Object.keys(planOverrides).length} unsaved changes
            </div>
          )}

          {/* Save/Discard buttons */}
          {hasUnsavedChanges && (
            <>
              <button onClick={discardChanges} style={{
                padding: '7px 14px', borderRadius: '8px', fontSize: '12px',
                background: 'transparent', border: '1px solid var(--border-strong)',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}>Discard</button>
              <button onClick={async () => { await saveChanges() }} style={{
                padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer',
              }}>Save to Plan vs Real</button>
            </>
          )}

          {/* Account selector button */}
          <button onClick={() => setShowAccountSelector(true)} style={{
            padding: '6px 14px', borderRadius: '8px', fontSize: '12px',
            background: 'transparent', border: '1px solid var(--border-strong)',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}>
            Accounts
          </button>
        </div>
      </div>

      {/* Modals */}
      {showAccountSelector && (
        <AccountSelectorModal
          accounts={cashAccounts}
          selected={openingAccounts}
          onSave={async (selected) => {
            setShowAccountSelector(false)
            await load(selected)
          }}
          onClose={() => setShowAccountSelector(false)}
        />
      )}

      {showSaveModal && (
        <SaveChangesModal
          count={Object.keys(planOverrides).length}
          onSave={saveChanges}
          onDiscard={discardChanges}
          onCancel={() => setShowSaveModal(false)}
        />
      )}

      {/* Table */}
      <div className="page-body" style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
          <thead>
            {/* Month headers */}
            <tr>
              <th style={{
                ...stickyLabel(0), position: 'sticky', left: 0, top: 0, zIndex: 20,
                background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-strong)',
                fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
              }}>CATEGORY</th>
              {MONTHS.map(m => (
                <th key={m} colSpan={3} style={monthHeaderStyle(m)}>
                  {MONTH_SHORT[m]}
                  {isCurrent(m) && <span style={{ marginLeft: '4px', fontSize: '8px' }}>●</span>}
                  {isFuture(m) && <span style={{ marginLeft: '4px', fontSize: '8px', color: 'var(--text-muted)' }}>proj</span>}
                </th>
              ))}
              <th style={{
                ...totalCell, position: 'sticky', right: 0, top: 0, zIndex: 20,
                fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', borderBottom: '1px solid var(--border)',
                textAlign: 'center',
              }}>TOTAL</th>
            </tr>
            {/* Sub-headers */}
            <tr>
              <th style={{ ...stickyLabel(0), position: 'sticky', left: 0, top: '28px', zIndex: 19, color: 'transparent' }}>—</th>
              {MONTHS.map(m => (
                <Fragment key={m}>
                  <th style={subHeaderStyle(m)}>Plan</th>
                  <th style={subHeaderStyle(m)}>Exec</th>
                  <th style={subHeaderStyle(m)}>Var%</th>
                </Fragment>
              ))}
              <th style={{ ...totalCell, position: 'sticky', right: 0, top: '28px', zIndex: 19, fontSize: '9px', color: 'var(--text-muted)', textAlign: 'center' }}>Exec</th>
            </tr>
          </thead>

          <tbody>
            {/* ── OPENING BALANCE ──────────────────────────────────── */}
            <tr style={{ background: 'var(--bg-surface)' }}>
              <td style={{ ...stickyLabel(0, true), background: 'var(--bg-surface)' }}>
                Opening Balance
              </td>
              {MONTHS.map(m => {
                const ms = computedSummary.find(s => s.month === m)
                const val = ms?.openingBalance || 0
                return (
                  <Fragment key={m}>
                    <td style={{ ...cellStyle(m), background: isCurrent(m) ? 'rgba(249,115,22,0.06)' : 'var(--bg-surface)' }}>
                      {fM(val, displayCurrency)}
                    </td>
                    <td style={{ ...cellStyle(m), fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.06)' : 'var(--bg-surface)' }}>
                      {fM(val, displayCurrency)}
                    </td>
                    <td style={{ ...cellStyle(m), background: isCurrent(m) ? 'rgba(249,115,22,0.06)' : 'var(--bg-surface)' }}>
                      —
                    </td>
                  </Fragment>
                )
              })}
              <td style={{ ...totalCell, background: 'var(--bg-surface)' }}>—</td>
            </tr>

            {/* ── INCOME ───────────────────────────────────────────── */}
            <tr onClick={() => toggleGroup('Income')} style={{ cursor: 'pointer', background: 'var(--bg-elevated)' }}>
              <td style={{ ...stickyLabel(0, true), background: 'var(--bg-elevated)', cursor: 'pointer' }}>
                {expandedGroups.has('Income') ? '▾' : '▸'} INCOME
              </td>
              {MONTHS.map(m => {
                const ms = computedSummary.find(s => s.month === m)
                const plan = ms?.incomePlan || 0
                const exec = ms?.incomeExec || 0
                const v = fVar(plan > 0 ? (exec - plan) / plan : null, 'income')
                return (
                  <Fragment key={m}>
                    <td style={{ ...cellStyle(m), background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {fM(plan, displayCurrency)}
                    </td>
                    <td style={{ ...cellStyle(m), fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {fM(exec, displayCurrency)}
                    </td>
                    <td style={{ ...cellStyle(m), color: v.color, fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {v.text}
                    </td>
                  </Fragment>
                )
              })}
              <td style={{ ...totalCell, background: 'var(--bg-elevated)' }}>
                {fM(computedSummary.reduce((s, m) => s + m.incomeExec, 0), displayCurrency)}
              </td>
            </tr>

            {expandedGroups.has('Income') && incomeRows.map(row => (
              <tr key={`${row.level_2}||${row.level_3}`}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <td style={{ ...stickyLabel(2) }}>
                  {row.level_3 || row.level_2}
                </td>
                {row.months.map(md => {
                  const plan = getPlanValue(row.level_2, row.level_3, md.month, md.plan)
                  const isModified = `${row.level_2}||${row.level_3 || ''}||${md.month}` in planOverrides
                  const v = fVar(plan > 0 ? (md.executed - plan) / plan : null, 'income')
                  return (
                    <Fragment key={md.month}>
                      <td style={{ ...cellStyle(md.month), background: isModified ? 'rgba(249,115,22,0.06)' : cellStyle(md.month).background }}>
                        <EditablePlanCell
                          value={plan}
                          month={md.month}
                          nativeCurrency={row.currency}
                          onChange={v => setPlan(row.level_2, row.level_3, md.month, v)}
                        />
                      </td>
                      <td style={cellStyle(md.month)}>{fM(convert(md.executed, row.currency, md.month), displayCurrency)}</td>
                      <td style={{ ...cellStyle(md.month), color: v.color, fontSize: '10px' }}>{v.text}</td>
                    </Fragment>
                  )
                })}
                <td style={totalCell}>{fM(rowTotalDisplay(row), displayCurrency)}</td>
              </tr>
            ))}

            {/* ── EXPENSE GROUPS (all Level 2 groups present in this user's data) ── */}
            {Object.keys(expenseByL2).map(l2 => {
              const l2rows = expenseByL2[l2]
              const groupKey = `Expense_${l2}`
              const isExpanded = expandedGroups.has(groupKey)
              return (
                <Fragment key={`expense_${l2}`}>
                  <tr onClick={() => toggleGroup(groupKey)} style={{ cursor: 'pointer', background: 'var(--bg-elevated)' }}>
                    <td style={{ ...stickyLabel(1, true), background: 'var(--bg-elevated)', cursor: 'pointer' }}>
                      {isExpanded ? '▾' : '▸'} {l2}
                    </td>
                    {MONTHS.map(m => {
                      const gPlan = l2rows.reduce((s, r) => s + convert(getPlanValue(r.level_2, r.level_3, m, r.months.find(x => x.month === m)?.plan || 0), r.currency, m), 0)
                      const gExec = l2rows.reduce((s, r) => s + convert(r.months.find(x => x.month === m)?.executed || 0, r.currency, m), 0)
                      const v = fVar(gPlan > 0 ? (gExec - gPlan) / gPlan : null, 'expense')
                      return (
                        <Fragment key={m}>
                          <td style={{ ...cellStyle(m), background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>{fM(gPlan, displayCurrency)}</td>
                          <td style={{ ...cellStyle(m), fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>{fM(gExec, displayCurrency)}</td>
                          <td style={{ ...cellStyle(m), color: v.color, fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>{v.text}</td>
                        </Fragment>
                      )
                    })}
                    <td style={{ ...totalCell, background: 'var(--bg-elevated)' }}>
                      {fM(l2rows.reduce((s, r) => s + rowTotalDisplay(r), 0), displayCurrency)}
                    </td>
                  </tr>
                  {isExpanded && l2rows.map(row => (
                    <tr key={`${row.level_2}||${row.level_3}`}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <td style={stickyLabel(2)}>{row.level_3 || row.level_2}</td>
                      {row.months.map(md => {
                        const plan = getPlanValue(row.level_2, row.level_3, md.month, md.plan)
                        const isModified = `${row.level_2}||${row.level_3 || ''}||${md.month}` in planOverrides
                        const v = fVar(plan > 0 ? (md.executed - plan) / plan : null, 'expense')
                        return (
                          <Fragment key={md.month}>
                            <td style={{ ...cellStyle(md.month), background: isModified ? 'rgba(249,115,22,0.06)' : cellStyle(md.month).background }}>
                              <EditablePlanCell
                                value={plan}
                                month={md.month}
                                nativeCurrency={row.currency}
                                onChange={v => setPlan(row.level_2, row.level_3, md.month, v)}
                              />
                            </td>
                            <td style={cellStyle(md.month)}>{fM(convert(md.executed, row.currency, md.month), displayCurrency)}</td>
                            <td style={{ ...cellStyle(md.month), color: v.color, fontSize: '10px' }}>{v.text}</td>
                          </Fragment>
                        )
                      })}
                      <td style={totalCell}>{fM(rowTotalDisplay(row), displayCurrency)}</td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}

            {/* ── RESULTADO ────────────────────────────────────────── */}
            <tr style={{ background: 'var(--bg-elevated)', borderTop: '2px solid var(--border-strong)' }}>
              <td style={{ ...stickyLabel(0, true), background: 'var(--bg-elevated)', borderTop: '2px solid var(--border-strong)' }}>
                RESULTADO
              </td>
              {MONTHS.map(m => {
                const ms = computedSummary.find(s => s.month === m)
                const plan = ms?.resultadoPlan || 0
                const exec = ms?.resultadoExec || 0
                const v = fVar(plan !== 0 ? (exec - plan) / Math.abs(plan) : null, 'income')
                return (
                  <Fragment key={m}>
                    <td style={{ ...cellStyle(m), fontWeight: 600, borderTop: '2px solid var(--border-strong)', background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {fM(plan, displayCurrency)}
                    </td>
                    <td style={{ ...cellStyle(m), fontWeight: 700, color: exec >= 0 ? 'var(--accent)' : 'var(--text-secondary)', borderTop: '2px solid var(--border-strong)', background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {fM(exec, displayCurrency)}
                    </td>
                    <td style={{ ...cellStyle(m), color: v.color, fontWeight: 600, borderTop: '2px solid var(--border-strong)', background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {v.text}
                    </td>
                  </Fragment>
                )
              })}
              <td style={{ ...totalCell, background: 'var(--bg-elevated)', borderTop: '2px solid var(--border-strong)' }}>
                {fM(computedSummary.reduce((s, m) => s + m.resultadoExec, 0), displayCurrency)}
              </td>
            </tr>

            {/* ── BALANCE ──────────────────────────────────────────── */}
            <tr style={{ background: 'var(--bg-surface)' }}>
              <td style={{ ...stickyLabel(0, true), background: 'var(--bg-surface)' }}>BALANCE</td>
              {MONTHS.map(m => {
                const ms = computedSummary.find(s => s.month === m)
                const plan = ms?.balancePlan || 0
                const exec = ms?.balanceEffective ?? ms?.balanceExec ?? 0
                return (
                  <Fragment key={m}>
                    <td style={{ ...cellStyle(m), fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-surface)' }}>
                      {fM(plan, displayCurrency)}
                    </td>
                    <td style={{ ...cellStyle(m), fontWeight: 800, fontSize: '12px', background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-surface)' }}>
                      {fM(exec, displayCurrency)}
                    </td>
                    <td style={{ ...cellStyle(m), background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-surface)' }}>—</td>
                  </Fragment>
                )
              })}
              <td style={{ ...totalCell, background: 'var(--bg-surface)' }}>—</td>
            </tr>

          </tbody>
        </table>
      </div>
    </div>
  )
}
