'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import TransactionForm from '@/app/components/TransactionForm'

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
  { key: '2026-01', label: 'Jan' },
  { key: '2026-02', label: 'Feb' },
  { key: '2026-03', label: 'Mar' },
  { key: '2026-04', label: 'Apr' },
  { key: '2026-05', label: 'May' },
  { key: '2026-06', label: 'Jun' },
  { key: '2026-07', label: 'Jul' },
  { key: '2026-08', label: 'Aug' },
  { key: '2026-09', label: 'Sep' },
  { key: '2026-10', label: 'Oct' },
  { key: '2026-11', label: 'Nov' },
  { key: '2026-12', label: 'Dec' },
]

const MONTH_FULL: Record<string, string> = {
  '2026-01': 'January 2026', '2026-02': 'February 2026', '2026-03': 'March 2026',
  '2026-04': 'April 2026', '2026-05': 'May 2026', '2026-06': 'June 2026',
  '2026-07': 'July 2026', '2026-08': 'August 2026', '2026-09': 'September 2026',
  '2026-10': 'October 2026', '2026-11': 'November 2026', '2026-12': 'December 2026',
}

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

export default function TransactionsPage() {
  const [selectedMonth, setSelectedMonth] = useState('2026-04')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
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
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setTransactions([])
    setNextCursor(null)
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

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this transaction?')) return
    await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' })
    setTransactions(prev => prev.filter(t => t.id !== id))
  }

  const income = transactions
    .filter(t => t.event_type === 'Income')
    .reduce((s, t) => s + parseFloat(t.amount), 0)
  const expense = transactions
    .filter(t => t.event_type === 'Expense')
    .reduce((s, t) => s + parseFloat(t.amount), 0)
  const balance = income - expense

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
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {MONTH_FULL[selectedMonth]}
          </p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          style={{
            background: 'var(--text-primary)',
            color: 'var(--text-inverse)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'var(--accent-hover)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'var(--text-primary)'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          New Transaction
        </button>
      </div>

      {/* Month tabs */}
      <div
        className="px-6 shrink-0 flex items-center gap-1"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          paddingTop: '12px',
          paddingBottom: '0',
        }}
      >
        {MONTHS.map(m => (
          <button
            key={m.key}
            onClick={() => setSelectedMonth(m.key)}
            className="relative px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors"
            style={{
              color: selectedMonth === m.key ? 'var(--text-primary)' : 'var(--text-muted)',
              background: selectedMonth === m.key ? 'var(--bg-base)' : 'transparent',
              borderTop: selectedMonth === m.key ? '1px solid var(--border)' : '1px solid transparent',
              borderLeft: selectedMonth === m.key ? '1px solid var(--border)' : '1px solid transparent',
              borderRight: selectedMonth === m.key ? '1px solid var(--border)' : '1px solid transparent',
              borderBottom: selectedMonth === m.key ? '1px solid var(--bg-base)' : '1px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div
        className="px-8 py-4 shrink-0 flex items-center gap-6"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {[
          { label: 'Income', value: income, positive: true },
          { label: 'Expense', value: expense, positive: false },
          { label: 'Balance', value: balance, positive: balance >= 0 },
        ].map(item => (
          <div key={item.label}>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              {item.label}
            </p>
            <p
              className="text-base font-semibold tabular-nums"
              style={{ color: item.positive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            >
              {formatCOP(item.value)}
            </p>
          </div>
        ))}
        <div className="ml-auto">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {transactions.length} transactions
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Date', 'Type', 'Category', 'Notes', 'From \u2192 To', 'Amount', ''].map((h, i) => (
                <th
                  key={h || i}
                  className="text-left py-3 text-xs font-medium"
                  style={{
                    color: 'var(--text-muted)',
                    paddingLeft: i === 0 ? '32px' : '12px',
                    paddingRight: i === 6 ? '16px' : '12px',
                    textAlign: i === 5 ? 'right' : 'left',
                    position: 'sticky',
                    top: 0,
                    background: 'var(--bg-base)',
                    zIndex: 10,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
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
                <td
                  className="py-3 text-xs whitespace-nowrap"
                  style={{ paddingLeft: '32px', paddingRight: '12px', color: 'var(--text-muted)' }}
                >
                  {formatDate(t.date)}
                </td>
                <td className="py-3 px-3">
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-md"
                    style={{
                      background: 'var(--bg-elevated)',
                      color: t.event_type === 'Income'
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                    }}
                  >
                    {t.event_type.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {t.level_2}
                  </span>
                  {t.level_3 && (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {' '}&middot; {t.level_3}
                    </span>
                  )}
                </td>
                <td className="py-3 px-3 max-w-[180px]">
                  <span
                    className="text-xs truncate block"
                    style={{ color: 'var(--text-muted)' }}
                    title={t.notes || ''}
                  >
                    {t.notes || '\u2014'}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {[t.from_account, t.to_account].filter(Boolean).join(' \u2192 ') || '\u2014'}
                  </span>
                </td>
                <td className="py-3 px-3 text-right">
                  <span
                    className="text-xs font-semibold tabular-nums"
                    style={{ color: t.event_type === 'Income' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                  >
                    {formatCOP(parseFloat(t.amount))}
                  </span>
                  {t.usd_amount && parseFloat(t.usd_amount) > 0 && (
                    <span className="text-xs ml-1.5" style={{ color: 'var(--text-muted)' }}>
                      ${parseFloat(t.usd_amount).toFixed(2)}
                    </span>
                  )}
                </td>
                <td className="py-3" style={{ paddingRight: '16px', paddingLeft: '8px' }}>
                  <button
                    onClick={() => handleDelete(t.id)}
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
            ))}
          </tbody>
        </table>

        <div ref={sentinelRef} className="h-4" />

        {loading && (
          <div className="py-8 text-center">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading&hellip;</span>
          </div>
        )}

        {!loading && transactions.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No transactions for {MONTH_FULL[selectedMonth]}
            </p>
            <button
              onClick={() => setFormOpen(true)}
              className="mt-4 text-xs underline"
              style={{ color: 'var(--text-secondary)' }}
            >
              Add the first one
            </button>
          </div>
        )}
      </div>

      <TransactionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={() => fetchTransactions(selectedMonth)}
        selectedMonth={selectedMonth}
      />
    </div>
  )
}
