'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'

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
  months: MonthData[]
  total: { plan: number; executed: number; diff: number; variance: number | null }
}

interface MonthlySummary {
  month: string
  isPast: boolean
  isCurrent: boolean
  isFuture: boolean
  openingBalance: number
  incomePlan: number
  incomeExec: number
  expensePlan: number
  expenseExec: number
  resultadoPlan: number
  resultadoExec: number
  balancePlan: number
  balanceExec: number
  fx: number
}

interface ComputedSummary extends MonthlySummary {
  balanceEffective: number
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CURRENT_MONTH = '2026-06'
const MONTHS = [
  '2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
  '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12',
]
const MONTH_SHORT: Record<string, string> = {
  '2026-01':'Jan','2026-02':'Feb','2026-03':'Mar','2026-04':'Apr',
  '2026-05':'May','2026-06':'Jun','2026-07':'Jul','2026-08':'Aug',
  '2026-09':'Sep','2026-10':'Oct','2026-11':'Nov','2026-12':'Dec',
}
const EXPENSE_ORDER = ['Life', 'Health', 'Travels', 'Others']

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fM(n: number, currency: 'COP' | 'USD', fx: number): string {
  const val = currency === 'USD' ? n / fx : n
  if (val === 0) return '—'
  const abs = Math.abs(val)
  const sign = val < 0 ? '-' : ''
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
      <div style={{
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
      <div style={{
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
function EditablePlanCell({
  value,
  month,
  currency,
  fx,
  onChange,
}: {
  value: number
  month: string
  currency: 'COP' | 'USD'
  fx: number
  onChange: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')

  const displayVal = currency === 'USD' ? value / fx : value

  const handleSave = () => {
    const cleaned = raw.replace(/[^0-9.]/g, '')
    const num = parseFloat(cleaned)
    if (!isNaN(num)) {
      const copVal = currency === 'USD' ? Math.round(num * fx) : Math.round(num)
      onChange(copVal)
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
        setRaw(displayVal === 0 ? '' : displayVal.toFixed(currency === 'USD' ? 2 : 0))
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
      {fM(value, currency, fx)}
    </span>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CashflowPage() {
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([])
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([])
  const [cashAccounts, setCashAccounts] = useState<string[]>([])
  const [openingAccounts, setOpeningAccounts] = useState<string[]>([
    'Bancolombia (Cash)', 'Dollar App (Cash)',
  ])
  const [avgFxRate, setAvgFxRate] = useState(3672)
  const [monthlyFx, setMonthlyFx] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState<'COP' | 'USD'>('COP')
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
      setCategoryRows(data.categoryRows || [])
      setMonthlySummary(data.monthlySummary || [])
      setCashAccounts(data.cashAccounts || [])
      setAvgFxRate(data.avgFxRate || 3672)
      setMonthlyFx(data.monthlyFx || {})
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

  // Compute rolling cashflow with overrides applied (iterative to avoid circular ref)
  const computedSummary: ComputedSummary[] = useMemo(() => {
    if (!monthlySummary.length || !categoryRows.length) {
      return monthlySummary.map(ms => ({ ...ms, balanceEffective: ms.balanceExec }))
    }

    const incRows = categoryRows.filter(r => r.eventType === 'Income')
    const expRows = categoryRows.filter(r => r.eventType === 'Expense')

    const result: ComputedSummary[] = []

    for (let i = 0; i < monthlySummary.length; i++) {
      const ms = monthlySummary[i]
      const m = ms.month

      const incomePlan = incRows.reduce((s, r) => {
        const mData = r.months.find(x => x.month === m)
        return s + getPlanValue(r.level_2, r.level_3, m, mData?.plan || 0)
      }, 0)

      const expensePlan = expRows.reduce((s, r) => {
        const mData = r.months.find(x => x.month === m)
        return s + getPlanValue(r.level_2, r.level_3, m, mData?.plan || 0)
      }, 0)

      const resultadoPlan = incomePlan - expensePlan
      const resultadoExec = ms.incomeExec - ms.expenseExec

      // Opening balance: first month from API, rest from previous month's effective balance
      const openingBalance = i === 0
        ? ms.openingBalance
        : result[i - 1].balanceEffective

      const balancePlan = openingBalance + resultadoPlan
      const balanceExec = openingBalance + resultadoExec
      const balanceEffective = (ms.isPast || ms.isCurrent) ? balanceExec : balancePlan

      result.push({
        ...ms,
        openingBalance,
        incomePlan,
        expensePlan,
        resultadoPlan,
        resultadoExec,
        balancePlan,
        balanceExec,
        balanceEffective,
      })
    }

    return result
  }, [monthlySummary, categoryRows, getPlanValue])

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

  // Group data
  const incomeRows = categoryRows.filter(r => r.eventType === 'Income')
  const expenseByL2: Record<string, CategoryRow[]> = {}
  categoryRows.filter(r => r.eventType === 'Expense').forEach(r => {
    if (!expenseByL2[r.level_2]) expenseByL2[r.level_2] = []
    expenseByL2[r.level_2].push(r)
  })

  const getFx = (month: string) => monthlyFx[month] || avgFxRate

  // ── Column styles ──────────────────────────────────────────────────────────
  const COL_W = '90px'

  const monthHeaderStyle = (m: string): React.CSSProperties => ({
    padding: '6px 0', fontSize: '10px',
    fontWeight: isCurrent(m) ? 800 : 600,
    color: isCurrent(m) ? 'var(--accent)' : isFuture(m) ? 'var(--text-muted)' : 'var(--text-secondary)',
    textAlign: 'center',
    borderBottom: '1px solid var(--border)',
    background: isCurrent(m) ? 'var(--accent-subtle)' : 'var(--bg-base)',
    position: 'sticky', top: 0, zIndex: 10, whiteSpace: 'nowrap',
    borderLeft: isCurrent(m) ? '1px solid var(--accent-border)' : 'none',
  })

  const subHeaderStyle = (m: string): React.CSSProperties => ({
    padding: '4px 6px', fontSize: '9px', fontWeight: 600,
    color: isCurrent(m) ? 'var(--accent)' : 'var(--text-muted)',
    textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: '1px solid var(--border)',
    background: isCurrent(m) ? 'var(--accent-subtle)' : 'var(--bg-base)',
    position: 'sticky', top: '28px', zIndex: 9,
    width: COL_W, minWidth: COL_W, maxWidth: COL_W,
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading cashflow…</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* Header */}
      <div style={{
        padding: '20px 32px 16px', borderBottom: '1px solid var(--border)',
        flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Cashflow
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Plan vs Ejecutado · 2026 · Rolling Opening Balance
            {currency === 'USD' && (
              <span style={{ marginLeft: '8px', color: 'var(--text-muted)', fontSize: '11px' }}>
                · Avg TRM: ${avgFxRate.toFixed(0)} COP/USD (projected months)
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>

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

          {/* COP/USD toggle */}
          <div style={{
            display: 'flex', borderRadius: '8px', overflow: 'hidden',
            border: '1px solid var(--border-strong)',
          }}>
            {(['COP', 'USD'] as const).map(c => (
              <button key={c} onClick={() => setCurrency(c)} style={{
                padding: '6px 14px', fontSize: '12px', fontWeight: 600,
                background: currency === c ? 'var(--accent)' : 'transparent',
                color: currency === c ? '#ffffff' : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer',
              }}>{c}</button>
            ))}
          </div>

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
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            {/* Month headers */}
            <tr>
              <th style={{
                ...stickyLabel(0), position: 'sticky', left: 0, top: 0, zIndex: 20,
                background: 'var(--bg-base)', borderBottom: '1px solid var(--border)',
                fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
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
                const fx = getFx(m)
                return (
                  <Fragment key={m}>
                    <td style={{ ...cellStyle(m), background: isCurrent(m) ? 'rgba(249,115,22,0.06)' : 'var(--bg-surface)' }}>
                      {fM(val, currency, fx)}
                    </td>
                    <td style={{ ...cellStyle(m), fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.06)' : 'var(--bg-surface)' }}>
                      {fM(val, currency, fx)}
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
                const fx = getFx(m)
                return (
                  <Fragment key={m}>
                    <td style={{ ...cellStyle(m), background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {fM(plan, currency, fx)}
                    </td>
                    <td style={{ ...cellStyle(m), fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {fM(exec, currency, fx)}
                    </td>
                    <td style={{ ...cellStyle(m), color: v.color, fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {v.text}
                    </td>
                  </Fragment>
                )
              })}
              <td style={{ ...totalCell, background: 'var(--bg-elevated)' }}>
                {fM(computedSummary.reduce((s, m) => s + m.incomeExec, 0), currency, avgFxRate)}
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
                  const fx = getFx(md.month)
                  return (
                    <Fragment key={md.month}>
                      <td style={{ ...cellStyle(md.month), background: isModified ? 'rgba(249,115,22,0.06)' : cellStyle(md.month).background }}>
                        <EditablePlanCell
                          value={plan}
                          month={md.month}
                          currency={currency}
                          fx={fx}
                          onChange={v => setPlan(row.level_2, row.level_3, md.month, v)}
                        />
                      </td>
                      <td style={cellStyle(md.month)}>{fM(md.executed, currency, fx)}</td>
                      <td style={{ ...cellStyle(md.month), color: v.color, fontSize: '10px' }}>{v.text}</td>
                    </Fragment>
                  )
                })}
                <td style={totalCell}>{fM(row.total.executed, currency, avgFxRate)}</td>
              </tr>
            ))}

            {/* ── EXPENSE GROUPS ───────────────────────────────────── */}
            {EXPENSE_ORDER.filter(l2 => expenseByL2[l2]).map(l2 => {
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
                      const gPlan = l2rows.reduce((s, r) => s + getPlanValue(r.level_2, r.level_3, m, r.months.find(x => x.month === m)?.plan || 0), 0)
                      const gExec = l2rows.reduce((s, r) => s + (r.months.find(x => x.month === m)?.executed || 0), 0)
                      const v = fVar(gPlan > 0 ? (gExec - gPlan) / gPlan : null, 'expense')
                      const fx = getFx(m)
                      return (
                        <Fragment key={m}>
                          <td style={{ ...cellStyle(m), background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>{fM(gPlan, currency, fx)}</td>
                          <td style={{ ...cellStyle(m), fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>{fM(gExec, currency, fx)}</td>
                          <td style={{ ...cellStyle(m), color: v.color, fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>{v.text}</td>
                        </Fragment>
                      )
                    })}
                    <td style={{ ...totalCell, background: 'var(--bg-elevated)' }}>
                      {fM(l2rows.reduce((s, r) => s + r.total.executed, 0), currency, avgFxRate)}
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
                        const fx = getFx(md.month)
                        return (
                          <Fragment key={md.month}>
                            <td style={{ ...cellStyle(md.month), background: isModified ? 'rgba(249,115,22,0.06)' : cellStyle(md.month).background }}>
                              <EditablePlanCell
                                value={plan}
                                month={md.month}
                                currency={currency}
                                fx={fx}
                                onChange={v => setPlan(row.level_2, row.level_3, md.month, v)}
                              />
                            </td>
                            <td style={cellStyle(md.month)}>{fM(md.executed, currency, fx)}</td>
                            <td style={{ ...cellStyle(md.month), color: v.color, fontSize: '10px' }}>{v.text}</td>
                          </Fragment>
                        )
                      })}
                      <td style={totalCell}>{fM(row.total.executed, currency, avgFxRate)}</td>
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
                const fx = getFx(m)
                return (
                  <Fragment key={m}>
                    <td style={{ ...cellStyle(m), fontWeight: 600, borderTop: '2px solid var(--border-strong)', background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {fM(plan, currency, fx)}
                    </td>
                    <td style={{ ...cellStyle(m), fontWeight: 700, color: exec >= 0 ? 'var(--accent)' : 'var(--text-secondary)', borderTop: '2px solid var(--border-strong)', background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {fM(exec, currency, fx)}
                    </td>
                    <td style={{ ...cellStyle(m), color: v.color, fontWeight: 600, borderTop: '2px solid var(--border-strong)', background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {v.text}
                    </td>
                  </Fragment>
                )
              })}
              <td style={{ ...totalCell, background: 'var(--bg-elevated)', borderTop: '2px solid var(--border-strong)' }}>
                {fM(computedSummary.reduce((s, m) => s + m.resultadoExec, 0), currency, avgFxRate)}
              </td>
            </tr>

            {/* ── BALANCE ──────────────────────────────────────────── */}
            <tr style={{ background: 'var(--bg-surface)' }}>
              <td style={{ ...stickyLabel(0, true), background: 'var(--bg-surface)' }}>BALANCE</td>
              {MONTHS.map(m => {
                const ms = computedSummary.find(s => s.month === m)
                const plan = ms?.balancePlan || 0
                const exec = ms?.balanceEffective ?? ms?.balanceExec ?? 0
                const fx = getFx(m)
                return (
                  <Fragment key={m}>
                    <td style={{ ...cellStyle(m), fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-surface)' }}>
                      {fM(plan, currency, fx)}
                    </td>
                    <td style={{ ...cellStyle(m), fontWeight: 800, fontSize: '12px', background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-surface)' }}>
                      {fM(exec, currency, fx)}
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
