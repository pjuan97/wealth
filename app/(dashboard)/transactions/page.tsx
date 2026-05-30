'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import TransactionForm from '@/app/components/TransactionForm'
import ConfirmDialog from '@/app/components/ConfirmDialog'

interface Transaction {
  id: number
  date: string
  month_label: string
  event_type: string
  level_1: string
  level_2: string
  level_3: string | null
  usd_amount: string | null
  fx_rate: string | null
  amount: string
  from_account: string | null
  to_account: string | null
  notes: string | null
}

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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function getUSD(t: Transaction, fxRate: number | null): number {
  if (t.usd_amount && parseFloat(t.usd_amount) > 0) {
    return parseFloat(t.usd_amount)
  }
  const rate = t.fx_rate ? parseFloat(t.fx_rate) : fxRate
  if (rate && rate > 0) {
    return parseFloat(t.amount) / rate
  }
  return 0
}

const EVENT_BADGE_STYLE: Record<string, React.CSSProperties> = {
  Income:         { background: 'rgba(148,163,184,0.15)', color: 'var(--text-primary)' },
  Expense:        { background: 'rgba(148,163,184,0.08)', color: 'var(--text-secondary)' },
  Transfer:       { background: 'rgba(148,163,184,0.06)', color: 'var(--text-muted)' },
  Investment:     { background: 'rgba(148,163,184,0.06)', color: 'var(--text-muted)' },
  Withdrawal:     { background: 'rgba(148,163,184,0.06)', color: 'var(--text-muted)' },
  Debt_Payment:   { background: 'rgba(148,163,184,0.06)', color: 'var(--text-muted)' },
  Opening_Balance:{ background: 'rgba(148,163,184,0.04)', color: 'var(--text-muted)' },
}

interface Filters {
  date: string
  type: string
  category: string
  subcategory: string
  from: string
  to: string
  notes: string
}

const emptyFilters: Filters = {
  date: '', type: '', category: '', subcategory: '', from: '', to: '', notes: '',
}

export default function TransactionsPage() {
  const [selectedMonth, setSelectedMonth] = useState('2026-04')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [fxRate, setFxRate] = useState<number | null>(null)
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const fetchTransactions = useCallback(async (month: string, cursor?: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ month })
      if (cursor) params.set('cursor', String(cursor))
      const res = await fetch(`/api/transactions?${params}`)
      const json = await res.json()
      setTransactions(prev => cursor ? [...prev, ...json.data] : json.data)
      setNextCursor(json.nextCursor)
      setHasMore(json.hasMore)
      if (!cursor) setFxRate(json.fxRate)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setTransactions([])
    setNextCursor(null)
    setFilters(emptyFilters)
    fetchTransactions(selectedMonth)
  }, [selectedMonth, fetchTransactions])

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loading && nextCursor) {
        fetchTransactions(selectedMonth, nextCursor)
      }
    })
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current)
    return () => observerRef.current?.disconnect()
  }, [hasMore, loading, nextCursor, selectedMonth, fetchTransactions])

  const handleDeleteConfirm = async () => {
    if (!deleteId) return
    await fetch(`/api/transactions?id=${deleteId}`, { method: 'DELETE' })
    setTransactions(prev => prev.filter(t => t.id !== deleteId))
    setDeleteId(null)
  }

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  // Apply filters
  const filtered = transactions.filter(t => {
    if (filters.date && !formatDate(t.date).toLowerCase().includes(filters.date.toLowerCase())) return false
    if (filters.type && !t.event_type.toLowerCase().includes(filters.type.toLowerCase())) return false
    if (filters.category && !t.level_2.toLowerCase().includes(filters.category.toLowerCase())) return false
    if (filters.subcategory && !(t.level_3 || '').toLowerCase().includes(filters.subcategory.toLowerCase())) return false
    if (filters.from && !(t.from_account || '').toLowerCase().includes(filters.from.toLowerCase())) return false
    if (filters.to && !(t.to_account || '').toLowerCase().includes(filters.to.toLowerCase())) return false
    if (filters.notes && !(t.notes || '').toLowerCase().includes(filters.notes.toLowerCase())) return false
    return true
  })

  const hasActiveFilters = Object.values(filters).some(v => v !== '')

  // Totals (from filtered)
  const incomeRows = filtered.filter(t => t.event_type === 'Income')
  const expenseRows = filtered.filter(t => t.event_type === 'Expense')

  const totalIncomeCOP = incomeRows.reduce((s, t) => s + parseFloat(t.amount), 0)
  const totalExpenseCOP = expenseRows.reduce((s, t) => s + parseFloat(t.amount), 0)
  const totalIncomeUSD = incomeRows.reduce((s, t) => s + getUSD(t, fxRate), 0)
  const totalExpenseUSD = expenseRows.reduce((s, t) => s + getUSD(t, fxRate), 0)
  const balanceCOP = totalIncomeCOP - totalExpenseCOP
  const balanceUSD = totalIncomeUSD - totalExpenseUSD

  const monthLabel = (MONTHS.find(m => m.key === selectedMonth)?.label || '') + ' 2026'

  const filterInputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '5px 8px',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    outline: 'none',
  }

  const thStyle: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    background: 'var(--bg-base)',
    zIndex: 10,
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '10px 10px 4px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)',
  }

  return (
    <div className="flex flex-col h-screen">

      {/* Page header */}
      <div
        className="px-8 py-6 shrink-0 flex items-start justify-between"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Transactions
          </h1>
          <p className="text-sm mt-1 font-medium" style={{ color: 'var(--text-muted)' }}>
            {monthLabel}
          </p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--text-primary)', color: 'var(--text-inverse)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          New Transaction
        </button>
      </div>

      {/* Month tabs */}
      <div
        className="px-6 shrink-0 overflow-x-auto"
        style={{
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-end gap-1 pt-3" style={{ minWidth: 'max-content' }}>
          {MONTHS.map(m => (
            <button
              key={m.key}
              onClick={() => setSelectedMonth(m.key)}
              className="px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap"
              style={{
                color: selectedMonth === m.key ? 'var(--text-primary)' : 'var(--text-muted)',
                background: selectedMonth === m.key ? 'var(--bg-base)' : 'transparent',
                border: selectedMonth === m.key
                  ? '1px solid var(--border)'
                  : '1px solid transparent',
                borderBottom: selectedMonth === m.key
                  ? '1px solid var(--bg-base)'
                  : '1px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div
        className="px-8 py-4 shrink-0 flex items-stretch gap-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {[
          { label: 'Income', cop: totalIncomeCOP, usd: totalIncomeUSD, positive: true },
          { label: 'Expense', cop: totalExpenseCOP, usd: totalExpenseUSD, positive: false },
          { label: 'Balance', cop: balanceCOP, usd: balanceUSD, positive: balanceCOP >= 0 },
        ].map(item => (
          <div
            key={item.label}
            className="flex-1 rounded-xl px-5 py-4"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
            }}
          >
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
              {item.label}
            </p>
            <p
              className="text-lg font-bold tabular-nums"
              style={{ color: item.positive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            >
              {formatCOP(item.cop)}
            </p>
            <p className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {formatUSD(item.usd)}
            </p>
          </div>
        ))}

        {/* Transaction count */}
        <div
          className="rounded-xl px-5 py-4 flex flex-col justify-between"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            minWidth: '120px',
          }}
        >
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Transactions
          </p>
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {filtered.length}
          </p>
          {hasActiveFilters && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              of {transactions.length} total
            </p>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: '1100px' }}>
          <thead>
            {/* Column headers */}
            <tr>
              {[
                { label: 'Date', width: '80px' },
                { label: 'Type', width: '120px' },
                { label: 'Category', width: '110px' },
                { label: 'Subcategory', width: '130px' },
                { label: 'From', width: '150px' },
                { label: 'To', width: '150px' },
                { label: 'Amount USD', width: '110px' },
                { label: 'Amount COP', width: '120px' },
                { label: 'Notes', width: '180px' },
                { label: '', width: '40px' },
              ].map((col, i) => (
                <th
                  key={col.label || i}
                  style={{
                    ...thStyle,
                    width: col.width,
                    paddingLeft: i === 0 ? '32px' : '10px',
                    textAlign: col.label.includes('Amount') ? 'right' : 'left',
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>

            {/* Filter row */}
            <tr style={{
              position: 'sticky',
              top: '37px',
              zIndex: 9,
              background: 'var(--bg-base)',
              borderBottom: '2px solid var(--border-strong)',
            }}>
              {[
                { key: 'date' as keyof Filters, placeholder: 'Filter...' },
                { key: 'type' as keyof Filters, placeholder: 'Filter...' },
                { key: 'category' as keyof Filters, placeholder: 'Filter...' },
                { key: 'subcategory' as keyof Filters, placeholder: 'Filter...' },
                { key: 'from' as keyof Filters, placeholder: 'Filter...' },
                { key: 'to' as keyof Filters, placeholder: 'Filter...' },
                null,
                null,
                { key: 'notes' as keyof Filters, placeholder: 'Filter...' },
                null,
              ].map((col, i) => (
                <td
                  key={i}
                  style={{
                    padding: '6px',
                    paddingLeft: i === 0 ? '32px' : '6px',
                  }}
                >
                  {col && (
                    <input
                      type="text"
                      placeholder={col.placeholder}
                      value={filters[col.key]}
                      onChange={e => setFilter(col.key, e.target.value)}
                      style={filterInputStyle}
                    />
                  )}
                </td>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map(t => {
              const usdVal = getUSD(t, fxRate)
              const copVal = parseFloat(t.amount)
              const isIncome = t.event_type === 'Income'

              return (
                <tr
                  key={t.id}
                  className="group transition-colors"
                  style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                >
                  {/* Date */}
                  <td style={{ padding: '11px 10px 11px 32px', color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {formatDate(t.date)}
                  </td>

                  {/* Type badge */}
                  <td style={{ padding: '11px 10px' }}>
                    <span
                      className="px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap"
                      style={EVENT_BADGE_STYLE[t.event_type] || EVENT_BADGE_STYLE['Transfer']}
                    >
                      {t.event_type.replace(/_/g, ' ')}
                    </span>
                  </td>

                  {/* Category */}
                  <td style={{ padding: '11px 10px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                    {t.level_2}
                  </td>

                  {/* Subcategory */}
                  <td style={{ padding: '11px 10px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    {t.level_3 || '\u2014'}
                  </td>

                  {/* From */}
                  <td style={{ padding: '11px 10px', color: 'var(--text-muted)', fontSize: '11px' }}>
                    {t.from_account || '\u2014'}
                  </td>

                  {/* To */}
                  <td style={{ padding: '11px 10px', color: 'var(--text-muted)', fontSize: '11px' }}>
                    {t.to_account || '\u2014'}
                  </td>

                  {/* Amount USD */}
                  <td style={{ padding: '11px 10px', textAlign: 'right' }}>
                    <span
                      className="text-xs font-medium tabular-nums"
                      style={{ color: isIncome ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      {formatUSD(usdVal)}
                    </span>
                  </td>

                  {/* Amount COP */}
                  <td style={{ padding: '11px 10px', textAlign: 'right' }}>
                    <span
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: isIncome ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      {formatCOP(copVal)}
                    </span>
                  </td>

                  {/* Notes */}
                  <td style={{ padding: '11px 10px', color: 'var(--text-muted)', fontSize: '12px', maxWidth: '180px' }}>
                    <span
                      className="block truncate"
                      title={t.notes || ''}
                    >
                      {t.notes || '\u2014'}
                    </span>
                  </td>

                  {/* Delete */}
                  <td style={{ padding: '11px 8px', width: '40px' }}>
                    <button
                      onClick={() => setDeleteId(t.id)}
                      className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded transition-all"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
                        ;(e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'transparent'
                        ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>

          {/* Totals footer */}
          {filtered.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                <td
                  colSpan={6}
                  style={{
                    padding: '12px 10px 12px 32px',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {hasActiveFilters ? 'Filtered totals' : 'Monthly totals'}
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    Income: {formatUSD(totalIncomeUSD)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    Expense: {formatUSD(totalExpenseUSD)}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: balanceUSD >= 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    Balance: {formatUSD(balanceUSD)}
                  </div>
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    Income: {formatCOP(totalIncomeCOP)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    Expense: {formatCOP(totalExpenseCOP)}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: balanceCOP >= 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    Balance: {formatCOP(balanceCOP)}
                  </div>
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-4" />

        {loading && (
          <div className="py-8 text-center">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading&hellip;</span>
          </div>
        )}

        {!loading && transactions.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              No transactions for {monthLabel}
            </p>
            <button
              onClick={() => setFormOpen(true)}
              className="text-xs underline"
              style={{ color: 'var(--text-secondary)' }}
            >
              Add the first one
            </button>
          </div>
        )}
      </div>

      {/* Form slide-over */}
      <TransactionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={() => fetchTransactions(selectedMonth)}
        selectedMonth={selectedMonth}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteId !== null}
        title="Delete transaction"
        message="This action cannot be undone. The transaction will be permanently removed."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
