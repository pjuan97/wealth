'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface PlanRow {
  id: number
  month_label: string
  event_type: string
  level_2: string
  level_3: string | null
  base: number
  inflation: number
  plan: number
  executed: number
  diff: number
  achievement: number | null
}

interface MonthlyTotals {
  income_plan: number
  income_exec: number
  expense_plan: number
  expense_exec: number
}

interface AnnualSummaryRow {
  month: string
  income_plan: number
  income_exec: number
  expense_plan: number
  expense_exec: number
  balance_plan: number
  balance_exec: number
  savings_rate_plan: number
  savings_rate_exec: number
}

interface CategoryAnnualRow {
  eventType: string
  level_2: string
  level_3: string | null
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
  if (isGood) return { text, color: 'var(--text-primary)' }
  return { text, color: 'var(--text-secondary)' }
}

// ─── Editable cell ────────────────────────────────────────────────────────────
function EditableAmount({
  value,
  onSave,
}: {
  value: number
  onSave: (newValue: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')
  const [saving, setSaving] = useState(false)

  const handleDoubleClick = () => {
    setRaw(String(Math.round(value)))
    setEditing(true)
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
        color: saving ? 'var(--text-muted)' : 'var(--text-primary)',
        borderBottom: '1px dashed var(--border-strong)',
        paddingBottom: '1px',
      }}
    >
      {formatCOP(value)}
    </span>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PlanPage() {
  const [tab, setTab] = useState<'monthly' | 'annual'>('monthly')
  const [selectedMonth, setSelectedMonth] = useState('2026-04')

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

  // ── Group rows ─────────────────────────────────────────────────────────────
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
    fontWeight: 600,
    color: 'var(--text-muted)',
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* Header */}
      <div style={{
        padding: '24px 32px 0',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Plan vs Real
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {tab === 'monthly' ? monthLabel : 'Full year 2026'}
            </p>
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
                  ? '2px solid var(--text-primary)'
                  : '2px solid transparent',
                color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
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
                  color: selectedMonth === m.key ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
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
              gap: '12px',
              flexShrink: 0,
            }}>
              {[
                { label: 'Income Plan', value: totals.income_plan, muted: false },
                { label: 'Income Executed', value: totals.income_exec, muted: false },
                { label: 'Expense Plan', value: totals.expense_plan, muted: true },
                { label: 'Expense Executed', value: totals.expense_exec, muted: true },
              ].map(card => (
                <div key={card.label} style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                }}>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                    {card.label}
                  </p>
                  <p style={{ fontSize: '16px', fontWeight: 700, color: card.muted ? 'var(--text-secondary)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCOP(card.value)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingMonthly ? (
              <div style={{ padding: '60px', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading…</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
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
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      {expandedGroups.has('Income') ? '▾' : '▸'} Income
                    </td>
                    <td style={{ ...tdStyle(), color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCOP(incomeRows.reduce((s, r) => s + r.plan, 0))}
                    </td>
                    <td style={{ ...tdStyle(), fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCOP(incomeRows.reduce((s, r) => s + r.executed, 0))}
                    </td>
                    <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {(() => {
                        const diff = incomeRows.reduce((s, r) => s + r.diff, 0)
                        return `${diff >= 0 ? '+' : ''}${formatCOP(diff)}`
                      })()}
                    </td>
                    <td style={{ ...tdStyle(), fontVariantNumeric: 'tabular-nums' }}>
                      {(() => {
                        const totalPlan = incomeRows.reduce((s, r) => s + r.plan, 0)
                        const totalExec = incomeRows.reduce((s, r) => s + r.executed, 0)
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
                      <td style={{ ...tdStyle('left'), paddingLeft: '48px', color: 'var(--text-secondary)' }}>
                        {row.level_2}
                        {row.level_3 && <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>· {row.level_3}</span>}
                      </td>
                      <td style={tdStyle()}>
                        <EditableAmount value={row.plan} onSave={v => updatePlan(row.id, v)} />
                      </td>
                      <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {formatCOP(row.executed)}
                      </td>
                      <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {`${row.diff >= 0 ? '+' : ''}${formatCOP(row.diff)}`}
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
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      borderBottom: '1px solid var(--border)',
                      borderTop: '2px solid var(--border-strong)',
                    }}>
                      {expandedGroups.has('Expenses') ? '▾' : '▸'} Expenses
                    </td>
                    <td style={{ ...tdStyle(), color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', borderTop: '2px solid var(--border-strong)' }}>
                      {totals ? formatCOP(totals.expense_plan) : '—'}
                    </td>
                    <td style={{ ...tdStyle(), fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', borderTop: '2px solid var(--border-strong)' }}>
                      {totals ? formatCOP(totals.expense_exec) : '—'}
                    </td>
                    <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', borderTop: '2px solid var(--border-strong)' }}>
                      {totals ? (() => {
                        const diff = totals.expense_exec - totals.expense_plan
                        return `${diff >= 0 ? '+' : ''}${formatCOP(diff)}`
                      })() : '—'}
                    </td>
                    <td style={{ ...tdStyle(), fontVariantNumeric: 'tabular-nums', borderTop: '2px solid var(--border-strong)' }}>
                      {totals && (() => {
                        const v = formatVariance(totals.expense_exec - totals.expense_plan, totals.expense_plan, 'Expense')
                        return <span style={{ fontSize: '12px', fontWeight: 600, color: v.color }}>{v.text}</span>
                      })()}
                    </td>
                  </tr>

                  {/* ── EXPENSE SUBCATEGORIES (Life, Health, Travels, Others) */}
                  {expandedGroups.has('Expenses') && EXPENSE_ORDER.filter(l2 => expenseByL2[l2]).map(l2 => {
                    const l2rows = expenseByL2[l2]
                    const groupKey = `Expense_${l2}`
                    const isExpanded = expandedGroups.has(groupKey)
                    const groupPlan = l2rows.reduce((s, r) => s + r.plan, 0)
                    const groupExec = l2rows.reduce((s, r) => s + r.executed, 0)
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
                          color: 'var(--text-secondary)',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          borderBottom: '1px solid var(--border)',
                        }}>
                          {isExpanded ? '▾' : '▸'} {l2}
                        </td>
                        <td style={{ ...tdStyle(), color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatCOP(groupPlan)}
                        </td>
                        <td style={{ ...tdStyle(), fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatCOP(groupExec)}
                        </td>
                        <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                          {`${groupDiff >= 0 ? '+' : ''}${formatCOP(groupDiff)}`}
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
                          <td style={{ ...tdStyle('left'), paddingLeft: '64px', color: 'var(--text-muted)' }}>
                            {row.level_3 || row.level_2}
                          </td>
                          <td style={tdStyle()}>
                            <EditableAmount value={row.plan} onSave={v => updatePlan(row.id, v)} />
                          </td>
                          <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                            {formatCOP(row.executed)}
                          </td>
                          <td style={{ ...tdStyle(), color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                            {`${row.diff >= 0 ? '+' : ''}${formatCOP(row.diff)}`}
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
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingAnnual ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading…</p>
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
                    Cashflow Summary
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Plan vs Executed by month · Double row: Plan / Executed
                  </p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
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
                      {[
                        { label: 'Income', planKey: 'income_plan' as const, execKey: 'income_exec' as const },
                        { label: 'Expense', planKey: 'expense_plan' as const, execKey: 'expense_exec' as const },
                        { label: 'Balance', planKey: 'balance_plan' as const, execKey: 'balance_exec' as const },
                        { label: 'Savings %', planKey: 'savings_rate_plan' as const, execKey: 'savings_rate_exec' as const },
                      ].map(({ label, planKey, execKey }) => {
                        const isRate = label === 'Savings %'
                        const totalPlan = isRate ? 0 : annualSummary.reduce((s, r) => s + (r[planKey] as number), 0)
                        const totalExec = isRate ? 0 : annualSummary.reduce((s, r) => s + (r[execKey] as number), 0)

                        return [
                          // Plan row
                          <tr key={`${label}_plan`} style={{ borderBottom: 'none' }}>
                            <td style={{ padding: '8px 16px 2px 20px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {label}
                              <span style={{ marginLeft: '6px', fontSize: '9px', color: 'var(--text-muted)', fontWeight: 400 }}>plan</span>
                            </td>
                            {annualSummary.map(row => (
                              <td key={row.month} style={{ padding: '8px 16px 2px', fontSize: '11px', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                {isRate
                                  ? formatAchievementPct(row[planKey] as number)
                                  : formatCOP(row[planKey] as number)}
                              </td>
                            ))}
                            <td style={{ padding: '8px 16px 2px', fontSize: '11px', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                              {isRate ? '—' : formatCOP(totalPlan)}
                            </td>
                          </tr>,
                          // Exec row
                          <tr key={`${label}_exec`} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '2px 16px 10px 20px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }} />
                            {annualSummary.map(row => {
                              const val = row[execKey] as number
                              const plan = row[planKey] as number
                              const isGood = label === 'Expense'
                                ? val <= plan
                                : val >= plan
                              return (
                                <td key={row.month} style={{
                                  padding: '2px 16px 10px',
                                  fontSize: '13px',
                                  fontWeight: 700,
                                  textAlign: 'right',
                                  color: val === 0
                                    ? 'var(--text-muted)'
                                    : isGood
                                      ? 'var(--text-primary)'
                                      : 'var(--text-secondary)',
                                  fontVariantNumeric: 'tabular-nums',
                                }}>
                                  {isRate
                                    ? formatAchievementPct(val)
                                    : formatCOP(val)}
                                </td>
                              )
                            })}
                            <td style={{ padding: '2px 16px 10px', fontSize: '13px', fontWeight: 700, textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                              {isRate ? '—' : formatCOP(totalExec)}
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
                          color: annualFilter === f ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                      >
                        {f === 'all' ? 'All' : f}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
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
                          <td style={{ padding: '10px 16px 10px 20px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginRight: '6px', textTransform: 'uppercase' }}>
                              {cat.eventType === 'Income' ? '↑' : '↓'}
                            </span>
                            {cat.level_2}
                            {cat.level_3 && (
                              <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>· {cat.level_3}</span>
                            )}
                          </td>
                          {cat.months.map(m => (
                            <td key={m.month} style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {m.exec === 0 && m.plan === 0 ? (
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
                              ) : (
                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {formatCOP(m.exec)}
                                  </div>
                                  {m.plan > 0 && (
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>
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
