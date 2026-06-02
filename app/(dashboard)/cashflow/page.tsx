'use client'

import { useState, useEffect, useRef, Fragment } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface MonthData {
  month: string
  plan: number
  executed: number
  diff: number
  variance: number | null
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
  opening_balance: number
  income_plan: number
  income_exec: number
  expense_plan: number
  expense_exec: number
  resultado_plan: number
  resultado_exec: number
  balance_plan: number
  balance_exec: number
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS_2026 = [
  '2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
  '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12',
]

const MONTH_SHORT: Record<string, string> = {
  '2026-01': 'Jan', '2026-02': 'Feb', '2026-03': 'Mar',
  '2026-04': 'Apr', '2026-05': 'May', '2026-06': 'Jun',
  '2026-07': 'Jul', '2026-08': 'Aug', '2026-09': 'Sep',
  '2026-10': 'Oct', '2026-11': 'Nov', '2026-12': 'Dec',
}

const CURRENT_MONTH = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
const EXPENSE_ORDER = ['Life', 'Health', 'Travels', 'Others']

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCOP(n: number): string {
  if (n === 0) return '—'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

function formatMillions(n: number): string {
  if (n === 0) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${n < 0 ? '-' : ''}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${n < 0 ? '-' : ''}${(abs / 1_000).toFixed(0)}K`
  return formatCOP(n)
}

function formatVariance(v: number | null, eventType: string): { text: string; color: string } {
  if (v === null) return { text: '—', color: 'var(--text-muted)' }
  const pct = v * 100
  const text = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
  const isGood = eventType === 'Income' ? pct >= 0 : pct <= 0
  const isNeutral = Math.abs(pct) <= 5
  if (isNeutral) return { text, color: 'var(--text-primary)' }
  if (isGood) return { text, color: 'var(--accent)' }
  return { text, color: 'var(--text-secondary)' }
}

function isFuture(month: string): boolean {
  return month > CURRENT_MONTH
}

function isCurrent(month: string): boolean {
  return month === CURRENT_MONTH
}

// ─── Bulk Edit Modal ──────────────────────────────────────────────────────────
function BulkEditModal({
  category,
  onSave,
  onClose,
}: {
  category: { eventType: string; level_2: string; level_3: string | null }
  onSave: (value: number, months: string[] | 'all') => Promise<void>
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const [monthMode, setMonthMode] = useState<'all' | 'from' | 'range'>('all')
  const [fromMonth, setFromMonth] = useState(CURRENT_MONTH)
  const [toMonth, setToMonth] = useState('2026-12')
  const [saving, setSaving] = useState(false)

  const getTargetMonths = (): string[] | 'all' => {
    if (monthMode === 'all') return 'all'
    if (monthMode === 'from') return MONTHS_2026.filter(m => m >= fromMonth)
    return MONTHS_2026.filter(m => m >= fromMonth && m <= toMonth)
  }

  const handleSave = async () => {
    const num = parseFloat(value.replace(/[^0-9.]/g, ''))
    if (isNaN(num)) return
    setSaving(true)
    await onSave(num, getTargetMonths())
    setSaving(false)
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-strong)',
    borderRadius: '6px',
    padding: '7px 10px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    outline: 'none',
  }

  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: '14px',
        padding: '28px 32px',
        width: '440px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Bulk Edit Plan
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          {category.level_2}{category.level_3 ? ` · ${category.level_3}` : ''}
        </p>

        {/* Value */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Valor Plan (COP)
          </label>
          <input
            autoFocus
            style={{ ...inputStyle, width: '100%' }}
            placeholder="Ej: 750000"
            value={value}
            onChange={e => setValue(e.target.value)}
          />
        </div>

        {/* Month mode */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Aplicar a
          </label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            {([
              { key: 'all', label: 'Todos los meses' },
              { key: 'from', label: 'Desde un mes' },
              { key: 'range', label: 'Rango' },
            ] as const).map(opt => (
              <button
                key={opt.key}
                onClick={() => setMonthMode(opt.key)}
                style={{
                  padding: '5px 12px', borderRadius: '6px', fontSize: '12px',
                  fontWeight: 500, cursor: 'pointer',
                  background: monthMode === opt.key ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                  color: monthMode === opt.key ? 'var(--accent)' : 'var(--text-secondary)',
                  border: monthMode === opt.key ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {monthMode !== 'all' && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Desde
                </label>
                <select style={{ ...selectStyle, width: '100%' }} value={fromMonth} onChange={e => setFromMonth(e.target.value)}>
                  {MONTHS_2026.map(m => <option key={m} value={m}>{MONTH_SHORT[m]} 2026</option>)}
                </select>
              </div>
              {monthMode === 'range' && (
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Hasta</label>
                  <select style={{ ...selectStyle, width: '100%' }} value={toMonth} onChange={e => setToMonth(e.target.value)}>
                    {MONTHS_2026.filter(m => m >= fromMonth).map(m => <option key={m} value={m}>{MONTH_SHORT[m]} 2026</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Preview */}
        <div style={{
          background: 'var(--bg-elevated)',
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '20px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
        }}>
          {value ? (
            <>
              Aplicará <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {formatCOP(parseFloat(value.replace(/[^0-9.]/g, '')) || 0)}
              </span> a{' '}
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                {monthMode === 'all'
                  ? '12 meses'
                  : monthMode === 'from'
                  ? `${MONTHS_2026.filter(m => m >= fromMonth).length} meses (${MONTH_SHORT[fromMonth]}–Dic)`
                  : `${MONTHS_2026.filter(m => m >= fromMonth && m <= toMonth).length} meses (${MONTH_SHORT[fromMonth]}–${MONTH_SHORT[toMonth]})`
                }
              </span>
            </>
          ) : (
            'Ingresa un valor para ver el preview'
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
            background: 'transparent', border: '1px solid var(--border-strong)',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !value} style={{
            padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            background: saving || !value ? 'var(--bg-elevated)' : 'var(--accent)',
            color: saving || !value ? 'var(--text-muted)' : '#ffffff',
            border: 'none', cursor: saving || !value ? 'not-allowed' : 'pointer',
          }}>
            {saving ? 'Guardando…' : 'Aplicar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CashflowPage() {
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([])
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['Income', 'Expense_Life', 'Expense_Health', 'Expense_Travels', 'Expense_Others'])
  )
  const [bulkEdit, setBulkEdit] = useState<{
    eventType: string; level_2: string; level_3: string | null
  } | null>(null)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  // Scroll to current month on load
  const currentMonthRef = useRef<HTMLTableCellElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/cashflow')
      const data = await res.json()
      setCategoryRows(data.categoryRows || [])
      setMonthlySummary(data.monthlySummary || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!loading && currentMonthRef.current) {
      currentMonthRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [loading])

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleBulkSave = async (value: number, months: string[] | 'all') => {
    if (!bulkEdit) return
    try {
      await fetch('/api/cashflow', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: bulkEdit.eventType,
          level_2: bulkEdit.level_2,
          level_3: bulkEdit.level_3,
          value: String(value),
          months,
        }),
      })
      await load()
    } catch (e) { console.error(e) }
  }

  // Derived data
  const incomeRows = categoryRows.filter(r => r.eventType === 'Income')
  const expenseRows = categoryRows.filter(r => r.eventType === 'Expense')
  const expenseByL2: Record<string, CategoryRow[]> = {}
  for (const row of expenseRows) {
    if (!expenseByL2[row.level_2]) expenseByL2[row.level_2] = []
    expenseByL2[row.level_2].push(row)
  }

  // ─── Styles ──────────────────────────────────────────────────────────────────
  const MONTHS = MONTHS_2026
  const COL_W = '88px'

  const monthHeaderStyle = (m: string): React.CSSProperties => ({
    padding: '6px 0',
    fontSize: '10px',
    fontWeight: isCurrent(m) ? 800 : 600,
    color: isCurrent(m) ? 'var(--accent)' : isFuture(m) ? 'var(--text-muted)' : 'var(--text-secondary)',
    textAlign: 'center',
    borderBottom: '1px solid var(--border)',
    background: isCurrent(m) ? 'var(--accent-subtle)' : 'var(--bg-base)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    whiteSpace: 'nowrap',
    borderLeft: isCurrent(m) ? '1px solid var(--accent-border)' : 'none',
    borderRight: isCurrent(m) ? '1px solid var(--accent-border)' : 'none',
  })

  const subHeaderStyle = (m: string): React.CSSProperties => ({
    padding: '4px 6px',
    fontSize: '9px',
    fontWeight: 600,
    color: isCurrent(m) ? 'var(--accent)' : 'var(--text-muted)',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: '1px solid var(--border)',
    background: isCurrent(m) ? 'var(--accent-subtle)' : 'var(--bg-base)',
    position: 'sticky',
    top: '28px',
    zIndex: 9,
    width: COL_W,
    minWidth: COL_W,
    maxWidth: COL_W,
  })

  const cellStyle = (m: string, isZero = false): React.CSSProperties => ({
    padding: '8px 6px',
    fontSize: '11px',
    color: isZero ? 'var(--text-muted)' : isFuture(m) ? 'var(--text-secondary)' : 'var(--text-primary)',
    textAlign: 'right',
    borderBottom: '1px solid var(--border)',
    fontVariantNumeric: 'tabular-nums',
    width: COL_W,
    minWidth: COL_W,
    maxWidth: COL_W,
    background: isCurrent(m) ? 'rgba(249,115,22,0.04)' : 'transparent',
    borderLeft: isCurrent(m) ? '1px solid var(--accent-border)' : 'none',
  })

  const totalCellStyle: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    textAlign: 'right',
    borderBottom: '1px solid var(--border)',
    fontVariantNumeric: 'tabular-nums',
    width: '100px',
    minWidth: '100px',
    background: 'var(--bg-surface)',
    position: 'sticky',
    right: 0,
    zIndex: 5,
    borderLeft: '1px solid var(--border)',
  }

  const rowLabelStyle = (indent = 0, bold = false): React.CSSProperties => ({
    padding: `9px 16px 9px ${16 + indent * 16}px`,
    fontSize: indent > 0 ? '12px' : '11px',
    fontWeight: bold ? 700 : indent > 1 ? 400 : 600,
    color: 'var(--text-primary)',
    textTransform: indent === 0 ? 'uppercase' : 'none',
    letterSpacing: indent === 0 ? '0.06em' : 'normal',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
    position: 'sticky',
    left: 0,
    zIndex: 8,
    background: 'var(--bg-base)',
    minWidth: '200px',
    maxWidth: '200px',
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading cashflow…</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* Header */}
      <div style={{
        padding: '20px 32px 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Cashflow
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Plan vs Ejecutado · 2026 · Opening Balance desde Bancolombia (Cash)
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '11px', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', display: 'inline-block' }} />
            Mes actual
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
            Doble-click en fila para editar plan en masa
          </span>
        </div>
      </div>

      {/* Bulk edit modal */}
      {bulkEdit && (
        <BulkEditModal
          category={bulkEdit}
          onSave={handleBulkSave}
          onClose={() => setBulkEdit(null)}
        />
      )}

      {/* Table container */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>

          {/* Header rows */}
          <thead>
            {/* Month names row */}
            <tr>
              <th style={{
                ...rowLabelStyle(0),
                position: 'sticky', left: 0, top: 0, zIndex: 20,
                background: 'var(--bg-base)',
                borderBottom: '1px solid var(--border)',
                fontSize: '11px', fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                CATEGORY
              </th>
              {MONTHS.map(m => (
                <th
                  key={m}
                  colSpan={3}
                  ref={isCurrent(m) ? currentMonthRef : undefined}
                  style={monthHeaderStyle(m)}
                >
                  {MONTH_SHORT[m]}
                  {isCurrent(m) && <span style={{ marginLeft: '4px', fontSize: '8px' }}>●</span>}
                </th>
              ))}
              <th style={{
                ...totalCellStyle,
                position: 'sticky', right: 0, top: 0, zIndex: 20,
                fontSize: '11px', fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                borderBottom: '1px solid var(--border)',
                textAlign: 'center',
              }}>
                TOTAL
              </th>
            </tr>

            {/* Sub-headers: Plan / Exec / Var% */}
            <tr>
              <th style={{ ...rowLabelStyle(0), position: 'sticky', left: 0, top: '28px', zIndex: 19, background: 'var(--bg-base)', borderBottom: '1px solid var(--border)', color: 'transparent' }}>
                —
              </th>
              {MONTHS.map(m => (
                <Fragment key={m}>
                  <th style={subHeaderStyle(m)}>Plan</th>
                  <th style={subHeaderStyle(m)}>Exec</th>
                  <th style={subHeaderStyle(m)}>Var%</th>
                </Fragment>
              ))}
              <th style={{ ...totalCellStyle, position: 'sticky', right: 0, top: '28px', zIndex: 19, fontSize: '9px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Exec
              </th>
            </tr>
          </thead>

          <tbody>

            {/* ── OPENING BALANCE ──────────────────────────────────────────── */}
            <tr style={{ background: 'var(--bg-surface)' }}>
              <td style={{ ...rowLabelStyle(0, true), background: 'var(--bg-surface)' }}>
                Opening Balance
              </td>
              {MONTHS.map(m => {
                const summary = monthlySummary.find(s => s.month === m)
                const val = summary?.opening_balance || 0
                return (
                  <Fragment key={m}>
                    <td style={{ ...cellStyle(m, val === 0), background: isCurrent(m) ? 'rgba(249,115,22,0.06)' : 'var(--bg-surface)' }}>
                      {formatMillions(val)}
                    </td>
                    <td style={{ ...cellStyle(m, val === 0), fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.06)' : 'var(--bg-surface)' }}>
                      {formatMillions(val)}
                    </td>
                    <td style={{ ...cellStyle(m, true), background: isCurrent(m) ? 'rgba(249,115,22,0.06)' : 'var(--bg-surface)' }}>
                      —
                    </td>
                  </Fragment>
                )
              })}
              <td style={{ ...totalCellStyle, background: 'var(--bg-surface)' }}>—</td>
            </tr>

            {/* ── INCOME GROUP ─────────────────────────────────────────────── */}
            <tr
              onClick={() => toggleGroup('Income')}
              style={{ cursor: 'pointer', background: 'var(--bg-elevated)' }}
            >
              <td style={{ ...rowLabelStyle(0, true), background: 'var(--bg-elevated)' }}>
                {expandedGroups.has('Income') ? '▾' : '▸'} INCOME
              </td>
              {MONTHS.map(m => {
                const summary = monthlySummary.find(s => s.month === m)
                const plan = summary?.income_plan || 0
                const exec = summary?.income_exec || 0
                const variance = plan > 0 ? (exec - plan) / plan : null
                const v = formatVariance(variance, 'Income')
                return (
                  <Fragment key={m}>
                    <td style={{ ...cellStyle(m, plan === 0), background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {formatMillions(plan)}
                    </td>
                    <td style={{ ...cellStyle(m, exec === 0), fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {formatMillions(exec)}
                    </td>
                    <td style={{ ...cellStyle(m), color: v.color, fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {v.text}
                    </td>
                  </Fragment>
                )
              })}
              <td style={{ ...totalCellStyle, background: 'var(--bg-elevated)' }}>
                {formatMillions(monthlySummary.reduce((s, m) => s + m.income_exec, 0))}
              </td>
            </tr>

            {/* Income detail rows */}
            {expandedGroups.has('Income') && incomeRows.map(row => {
              const rowKey = `${row.level_2}||${row.level_3 || ''}`
              return (
                <tr
                  key={rowKey}
                  onMouseEnter={() => setHoveredRow(rowKey)}
                  onMouseLeave={() => setHoveredRow(null)}
                  onDoubleClick={() => setBulkEdit({ eventType: row.eventType, level_2: row.level_2, level_3: row.level_3 })}
                  style={{ cursor: 'default' }}
                >
                  <td style={{
                    ...rowLabelStyle(2),
                    background: hoveredRow === rowKey ? 'var(--bg-surface)' : 'var(--bg-base)',
                  }}>
                    {row.level_3 || row.level_2}
                    {hoveredRow === rowKey && (
                      <span
                        onClick={e => { e.stopPropagation(); setBulkEdit({ eventType: row.eventType, level_2: row.level_2, level_3: row.level_3 }) }}
                        style={{ marginLeft: '8px', fontSize: '10px', color: 'var(--accent)', cursor: 'pointer' }}
                      >
                        ✏️
                      </span>
                    )}
                  </td>
                  {row.months.map(m => {
                    const v = formatVariance(m.variance, row.eventType)
                    return (
                      <Fragment key={m.month}>
                        <td style={cellStyle(m.month, m.plan === 0)}>{formatMillions(m.plan)}</td>
                        <td style={{ ...cellStyle(m.month, m.executed === 0), fontWeight: m.executed > 0 ? 500 : 400 }}>{formatMillions(m.executed)}</td>
                        <td style={{ ...cellStyle(m.month), color: v.color, fontSize: '10px' }}>{v.text}</td>
                      </Fragment>
                    )
                  })}
                  <td style={totalCellStyle}>{formatMillions(row.total.executed)}</td>
                </tr>
              )
            })}

            {/* ── EXPENSE GROUPS ───────────────────────────────────────────── */}
            {EXPENSE_ORDER.filter(l2 => expenseByL2[l2]).map(l2 => {
              const l2rows = expenseByL2[l2]
              const groupKey = `Expense_${l2}`
              const isExpanded = expandedGroups.has(groupKey)

              return (
                <Fragment key={`expense_${l2}`}>
                  {/* Group header */}
                  <tr
                    onClick={() => toggleGroup(groupKey)}
                    style={{ cursor: 'pointer', background: 'var(--bg-elevated)' }}
                  >
                    <td style={{ ...rowLabelStyle(1, true), background: 'var(--bg-elevated)' }}>
                      {isExpanded ? '▾' : '▸'} {l2}
                    </td>
                    {MONTHS.map(m => {
                      const groupPlan = l2rows.reduce((s, r) => s + (r.months.find(x => x.month === m)?.plan || 0), 0)
                      const groupExec = l2rows.reduce((s, r) => s + (r.months.find(x => x.month === m)?.executed || 0), 0)
                      const groupVariance = groupPlan > 0 ? (groupExec - groupPlan) / groupPlan : null
                      const v = formatVariance(groupVariance, 'Expense')
                      return (
                        <Fragment key={m}>
                          <td style={{ ...cellStyle(m, groupPlan === 0), background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                            {formatMillions(groupPlan)}
                          </td>
                          <td style={{ ...cellStyle(m, groupExec === 0), fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                            {formatMillions(groupExec)}
                          </td>
                          <td style={{ ...cellStyle(m), color: v.color, fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                            {v.text}
                          </td>
                        </Fragment>
                      )
                    })}
                    <td style={{ ...totalCellStyle, background: 'var(--bg-elevated)' }}>
                      {formatMillions(l2rows.reduce((s, r) => s + r.total.executed, 0))}
                    </td>
                  </tr>

                  {/* Individual rows */}
                  {isExpanded && l2rows.map(row => {
                    const rowKey = `${row.level_2}||${row.level_3 || ''}`
                    return (
                      <tr
                        key={rowKey}
                        onMouseEnter={() => setHoveredRow(rowKey)}
                        onMouseLeave={() => setHoveredRow(null)}
                        onDoubleClick={() => setBulkEdit({ eventType: row.eventType, level_2: row.level_2, level_3: row.level_3 })}
                      >
                        <td style={{
                          ...rowLabelStyle(2),
                          background: hoveredRow === rowKey ? 'var(--bg-surface)' : 'var(--bg-base)',
                        }}>
                          {row.level_3 || row.level_2}
                          {hoveredRow === rowKey && (
                            <span
                              onClick={e => { e.stopPropagation(); setBulkEdit({ eventType: row.eventType, level_2: row.level_2, level_3: row.level_3 }) }}
                              style={{ marginLeft: '8px', fontSize: '10px', color: 'var(--accent)', cursor: 'pointer' }}
                            >
                              ✏️
                            </span>
                          )}
                        </td>
                        {row.months.map(m => {
                          const v = formatVariance(m.variance, row.eventType)
                          return (
                            <Fragment key={m.month}>
                              <td style={cellStyle(m.month, m.plan === 0)}>{formatMillions(m.plan)}</td>
                              <td style={{ ...cellStyle(m.month, m.executed === 0), fontWeight: m.executed > 0 ? 500 : 400 }}>{formatMillions(m.executed)}</td>
                              <td style={{ ...cellStyle(m.month), color: v.color, fontSize: '10px' }}>{v.text}</td>
                            </Fragment>
                          )
                        })}
                        <td style={totalCellStyle}>{formatMillions(row.total.executed)}</td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}

            {/* ── TOTAL EXPENSES ────────────────────────────────────────────── */}
            <tr style={{ background: 'var(--bg-elevated)' }}>
              <td style={{ ...rowLabelStyle(0, true), background: 'var(--bg-elevated)' }}>
                TOTAL EXPENSES
              </td>
              {MONTHS.map(m => {
                const summary = monthlySummary.find(s => s.month === m)
                const plan = summary?.expense_plan || 0
                const exec = summary?.expense_exec || 0
                const variance = plan > 0 ? (exec - plan) / plan : null
                const v = formatVariance(variance, 'Expense')
                return (
                  <Fragment key={m}>
                    <td style={{ ...cellStyle(m, plan === 0), background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {formatMillions(plan)}
                    </td>
                    <td style={{ ...cellStyle(m, exec === 0), fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {formatMillions(exec)}
                    </td>
                    <td style={{ ...cellStyle(m), color: v.color, fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)' }}>
                      {v.text}
                    </td>
                  </Fragment>
                )
              })}
              <td style={{ ...totalCellStyle, background: 'var(--bg-elevated)' }}>
                {formatMillions(monthlySummary.reduce((s, m) => s + m.expense_exec, 0))}
              </td>
            </tr>

            {/* ── RESULTADO ────────────────────────────────────────────────── */}
            <tr style={{ background: 'var(--bg-elevated)', borderTop: '2px solid var(--border-strong)' }}>
              <td style={{ ...rowLabelStyle(0, true), background: 'var(--bg-elevated)', borderTop: '2px solid var(--border-strong)' }}>
                RESULTADO
              </td>
              {MONTHS.map(m => {
                const summary = monthlySummary.find(s => s.month === m)
                const plan = summary?.resultado_plan || 0
                const exec = summary?.resultado_exec || 0
                const variance = plan !== 0 ? (exec - plan) / Math.abs(plan) : null
                const v = formatVariance(variance, 'Income')
                return (
                  <Fragment key={m}>
                    <td style={{ ...cellStyle(m, plan === 0), fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)', borderTop: '2px solid var(--border-strong)' }}>
                      {formatMillions(plan)}
                    </td>
                    <td style={{ ...cellStyle(m, exec === 0), fontWeight: 700, color: exec >= 0 ? 'var(--accent)' : 'var(--text-secondary)', background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)', borderTop: '2px solid var(--border-strong)' }}>
                      {formatMillions(exec)}
                    </td>
                    <td style={{ ...cellStyle(m), color: v.color, fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-elevated)', borderTop: '2px solid var(--border-strong)' }}>
                      {v.text}
                    </td>
                  </Fragment>
                )
              })}
              <td style={{ ...totalCellStyle, background: 'var(--bg-elevated)', borderTop: '2px solid var(--border-strong)' }}>
                {formatMillions(monthlySummary.reduce((s, m) => s + m.resultado_exec, 0))}
              </td>
            </tr>

            {/* ── BALANCE ──────────────────────────────────────────────────── */}
            <tr style={{ background: 'var(--bg-surface)' }}>
              <td style={{ ...rowLabelStyle(0, true), background: 'var(--bg-surface)' }}>
                BALANCE
              </td>
              {MONTHS.map(m => {
                const summary = monthlySummary.find(s => s.month === m)
                const plan = summary?.balance_plan || 0
                const exec = summary?.balance_exec || 0
                return (
                  <Fragment key={m}>
                    <td style={{ ...cellStyle(m, plan === 0), fontWeight: 600, background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-surface)' }}>
                      {formatMillions(plan)}
                    </td>
                    <td style={{ ...cellStyle(m, exec === 0), fontWeight: 800, fontSize: '12px', background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-surface)' }}>
                      {formatMillions(exec)}
                    </td>
                    <td style={{ ...cellStyle(m, true), background: isCurrent(m) ? 'rgba(249,115,22,0.08)' : 'var(--bg-surface)' }}>
                      —
                    </td>
                  </Fragment>
                )
              })}
              <td style={{ ...totalCellStyle, background: 'var(--bg-surface)' }}>—</td>
            </tr>

          </tbody>
        </table>
      </div>
    </div>
  )
}
