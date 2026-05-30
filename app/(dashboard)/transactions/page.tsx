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
  '2026-01', '2026-02', '2026-03', '2026-04',
  '2026-05', '2026-06', '2026-07', '2026-08',
  '2026-09', '2026-10', '2026-11', '2026-12',
]

const MONTH_NAMES: Record<string, string> = {
  '2026-01': 'January', '2026-02': 'February', '2026-03': 'March',
  '2026-04': 'April', '2026-05': 'May', '2026-06': 'June',
  '2026-07': 'July', '2026-08': 'August', '2026-09': 'September',
  '2026-10': 'October', '2026-11': 'November', '2026-12': 'December',
}

function formatCOP(amount: string | number) {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  Income: 'text-white',
  Expense: 'text-white/70',
  Transfer: 'text-white/50',
  Investment: 'text-white/50',
  Withdrawal: 'text-white/50',
  Debt_Payment: 'text-white/50',
  Opening_Balance: 'text-white/30',
}

export default function TransactionsPage() {
  const [selectedMonth, setSelectedMonth] = useState('2026-04')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const fetchTransactions = useCallback(async (month: string, cursor?: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ month })
      if (cursor) params.set('cursor', String(cursor))
      const res = await fetch(`/api/transactions?${params}`)
      const json = await res.json()
      if (cursor) {
        setTransactions(prev => [...prev, ...json.data])
      } else {
        setTransactions(json.data)
      }
      setNextCursor(json.nextCursor)
      setHasMore(json.hasMore)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  // Reset and reload when month changes
  useEffect(() => {
    setTransactions([])
    setNextCursor(null)
    fetchTransactions(selectedMonth)
  }, [selectedMonth, fetchTransactions])

  // Infinite scroll sentinel
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

  // Monthly summary
  const income = transactions
    .filter(t => t.event_type === 'Income')
    .reduce((s, t) => s + parseFloat(t.amount), 0)
  const expense = transactions
    .filter(t => t.event_type === 'Expense')
    .reduce((s, t) => s + parseFloat(t.amount), 0)
  const balance = income - expense

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">Transactions</h1>
          <p className="text-white/40 text-sm mt-0.5">Income, expenses, and financial movements</p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold rounded-md hover:bg-white/90 transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          New Transaction
        </button>
      </div>

      {/* Month selector */}
      <div className="px-8 py-3 border-b border-white/10 flex items-center gap-1 shrink-0 overflow-x-auto">
        {MONTHS.map(m => (
          <button
            key={m}
            onClick={() => setSelectedMonth(m)}
            className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors
              ${selectedMonth === m
                ? 'bg-white text-black'
                : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
          >
            {MONTH_NAMES[m]}
          </button>
        ))}
      </div>

      {/* Summary bar */}
      <div className="px-8 py-3 border-b border-white/10 flex items-center gap-8 shrink-0">
        <div>
          <span className="text-white/30 text-xs">Income</span>
          <p className="text-white text-sm font-medium">{formatCOP(income)}</p>
        </div>
        <div>
          <span className="text-white/30 text-xs">Expense</span>
          <p className="text-white/70 text-sm font-medium">{formatCOP(expense)}</p>
        </div>
        <div>
          <span className="text-white/30 text-xs">Balance</span>
          <p className={`text-sm font-medium ${balance >= 0 ? 'text-white' : 'text-white/50'}`}>
            {formatCOP(balance)}
          </p>
        </div>
        <div className="ml-auto">
          <span className="text-white/20 text-xs">{transactions.length} transactions</span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-black border-b border-white/10">
            <tr>
              <th className="text-left px-8 py-3 text-white/30 text-xs font-medium">Date</th>
              <th className="text-left px-3 py-3 text-white/30 text-xs font-medium">Type</th>
              <th className="text-left px-3 py-3 text-white/30 text-xs font-medium">Category</th>
              <th className="text-left px-3 py-3 text-white/30 text-xs font-medium">From</th>
              <th className="text-left px-3 py-3 text-white/30 text-xs font-medium">To</th>
              <th className="text-right px-8 py-3 text-white/30 text-xs font-medium">Amount</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t, i) => (
              <tr
                key={t.id}
                className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors
                  ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}
              >
                <td className="px-8 py-3 text-white/50 text-xs whitespace-nowrap">
                  {formatDate(t.date)}
                </td>
                <td className="px-3 py-3">
                  <span className={`text-xs font-medium ${EVENT_TYPE_COLORS[t.event_type] || 'text-white/50'}`}>
                    {t.event_type.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-white/70 text-xs">{t.level_2}</span>
                  {t.level_3 && (
                    <span className="text-white/30 text-xs"> &middot; {t.level_3}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-white/30 text-xs">{t.from_account || '—'}</td>
                <td className="px-3 py-3 text-white/30 text-xs">{t.to_account || '—'}</td>
                <td className="px-8 py-3 text-right">
                  <span className={`text-xs font-medium tabular-nums
                    ${t.event_type === 'Income' ? 'text-white' : 'text-white/60'}`}>
                    {formatCOP(t.amount)}
                  </span>
                  {t.usd_amount && (
                    <span className="text-white/20 text-xs ml-1">
                      (${parseFloat(t.usd_amount).toFixed(2)})
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="text-white/10 hover:text-white/50 transition-colors text-base leading-none"
                  >
                    &times;
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-4" />

        {/* Loading */}
        {loading && (
          <div className="text-center py-6">
            <span className="text-white/20 text-xs">Loading...</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && transactions.length === 0 && (
          <div className="text-center py-16">
            <p className="text-white/20 text-sm">No transactions for {MONTH_NAMES[selectedMonth]}</p>
          </div>
        )}
      </div>

      {/* Slide-over form */}
      <TransactionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={() => fetchTransactions(selectedMonth)}
        selectedMonth={selectedMonth}
      />
    </div>
  )
}
