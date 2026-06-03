'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
  Income:         { background: 'var(--accent-subtle)', color: 'var(--accent)' },
  Expense:        { background: 'rgba(148,163,184,0.08)', color: 'var(--text-secondary)' },
  Transfer:       { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' },
  Investment:     { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' },
  Withdrawal:     { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' },
  Debt_Payment:   { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' },
  Opening_Balance:{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' },
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

  // Sort
  const [sortConfig, setSortConfig] = useState<{
    key: string
    direction: 'asc' | 'desc'
  } | null>(null)

  const handleSort = (key: string) => {
    setSortConfig(prev =>
      prev?.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    )
  }

  const sortedTransactions = useMemo(() => {
    if (!sortConfig) return filtered
    return [...filtered].sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortConfig.key) {
        case 'date':
          aVal = new Date(a.date).getTime()
          bVal = new Date(b.date).getTime()
          break
        case 'event_type':
          aVal = a.event_type || ''
          bVal = b.event_type || ''
          break
        case 'level_2':
          aVal = a.level_2 || ''
          bVal = b.level_2 || ''
          break
        case 'level_3':
          aVal = a.level_3 || ''
          bVal = b.level_3 || ''
          break
        case 'amount':
          aVal = Number(a.amount) || 0
          bVal = Number(b.amount) || 0
          break
        case 'usd_amount':
          aVal = Number(a.usd_amount) || 0
          bVal = Number(b.usd_amount) || 0
          break
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortConfig])

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

  // ── CSV Export ──────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ['date', 'event_type', 'level_1', 'level_2', 'level_3', 'usd_amount', 'fx_rate', 'amount', 'from_account', 'to_account', 'notes']
    const rows = filtered.map(t =>
      headers.map(h => {
        const val = t[h as keyof Transaction]
        if (val === null || val === undefined) return ''
        const s = String(val)
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s
      }).join(',')
    )
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions_${selectedMonth}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── CSV Import ──────────────────────────────────────────────────────────────
  const csvInputRef = useRef<HTMLInputElement>(null)

  const importCSV = async (file: File) => {
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) return

    const headers = lines[0].split(',').map(h => h.trim())
    const txs = lines.slice(1).map(line => {
      const values: string[] = []
      let current = ''
      let inQuotes = false
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; continue }
        if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue }
        current += char
      }
      values.push(current.trim())

      const obj: Record<string, string | null> = {}
      headers.forEach((h, i) => { obj[h] = values[i] || null })
      return {
        date: obj.date || '',
        event_type: obj.event_type || 'Expense',
        level_1: obj.level_1 || 'Expense',
        level_2: obj.level_2 || 'Others',
        level_3: obj.level_3 || null,
        usd_amount: obj.usd_amount ? parseFloat(obj.usd_amount) : null,
        fx_rate: obj.fx_rate ? parseFloat(obj.fx_rate) : null,
        amount: obj.amount ? parseFloat(obj.amount) : null,
        from_account: obj.from_account || null,
        to_account: obj.to_account || null,
        notes: obj.notes || null,
      }
    }).filter(t => t.date && t.amount)

    if (txs.length === 0) return

    try {
      const res = await fetch('/api/ai-import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: txs }),
      })
      const data = await res.json()
      if (data.imported > 0) {
        fetchTransactions(selectedMonth)
      }
      alert(`Imported ${data.imported} of ${txs.length} transactions.${data.errors?.length ? '\nErrors:\n' + data.errors.join('\n') : ''}`)
    } catch (err) {
      alert('Import failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

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
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: '700',
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
      <div style={{
        padding: '20px 32px 0',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Transactions
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {monthLabel}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
            <button
              onClick={exportCSV}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-strong)',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Export CSV
            </button>
            <button
              onClick={() => csvInputRef.current?.click()}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-strong)',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Import CSV
            </button>
            <button
              onClick={() => setFormOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: 'var(--accent)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + New Transaction
            </button>
          </div>
        </div>

        {/* Month tabs */}
        <div style={{
          display: 'flex',
          gap: '0',
          overflowX: 'auto',
        }}>
          {MONTHS.map(m => (
            <button
              key={m.key}
              onClick={() => setSelectedMonth(m.key)}
              style={{
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: selectedMonth === m.key ? 700 : 500,
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                borderBottom: selectedMonth === m.key
                  ? '2px solid var(--accent)'
                  : '2px solid transparent',
                color: selectedMonth === m.key ? 'var(--accent)' : 'var(--text-secondary)',
                opacity: 1,
                whiteSpace: 'nowrap',
                marginBottom: '-1px',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr',
        gap: '0',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {[
          {
            label: 'Income',
            icon: '\u2191',
            cop: totalIncomeCOP,
            usd: totalIncomeUSD,
            accent: 'var(--text-primary)',
            borderColor: 'rgba(148,163,184,0.6)',
          },
          {
            label: 'Expense',
            icon: '\u2193',
            cop: totalExpenseCOP,
            usd: totalExpenseUSD,
            accent: 'var(--text-secondary)',
            borderColor: 'rgba(100,116,139,0.5)',
          },
          {
            label: 'Balance',
            icon: '=',
            cop: balanceCOP,
            usd: balanceUSD,
            accent: 'var(--text-primary)',
            borderColor: 'rgba(148,163,184,0.3)',
          },
          {
            label: 'Transactions',
            icon: '#',
            cop: null as number | null,
            usd: null as number | null,
            count: filtered.length,
            accent: 'var(--text-muted)',
            borderColor: 'rgba(71,85,105,0.4)',
          },
        ].map(card => (
          <div key={card.label} style={{
            padding: '16px 24px',
            borderLeft: `3px solid ${card.borderColor}`,
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}>
            {/* Label row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--accent)',
              }}>
                {card.icon}
              </span>
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                {card.label}
              </span>
            </div>
            {/* Value */}
            {card.cop !== null ? (
              <>
                <p style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1.1,
                }}>
                  {formatCOP(card.cop)}
                </p>
                <p style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatUSD(card.usd ?? 0)}
                </p>
              </>
            ) : (
              <p style={{
                fontSize: '28px',
                fontWeight: 800,
                color: 'var(--text-primary)',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.1,
              }}>
                {card.count}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '1100px' }}>
          <thead>
            {/* Column headers */}
            <tr>
              {[
                { label: 'Date', width: '80px', sortKey: 'date' },
                { label: 'Type', width: '120px', sortKey: 'event_type' },
                { label: 'Category', width: '110px', sortKey: 'level_2' },
                { label: 'Subcategory', width: '130px', sortKey: 'level_3' },
                { label: 'From', width: '150px', sortKey: null },
                { label: 'To', width: '150px', sortKey: null },
                { label: 'Amount USD', width: '110px', sortKey: 'usd_amount' },
                { label: 'Amount COP', width: '120px', sortKey: 'amount' },
                { label: 'Notes', width: '180px', sortKey: null },
                { label: '', width: '40px', sortKey: null },
              ].map((col, i) => (
                <th
                  key={col.label || i}
                  onClick={col.sortKey ? () => handleSort(col.sortKey!) : undefined}
                  style={{
                    ...thStyle,
                    width: col.width,
                    paddingLeft: i === 0 ? '32px' : '10px',
                    textAlign: col.label.includes('Amount') ? 'right' : 'left',
                    cursor: col.sortKey ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: col.label.includes('Amount') ? 'flex-end' : 'flex-start' }}>
                    {col.label}
                    {col.sortKey && (
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)', opacity: 0.7 }}>
                        {sortConfig?.key === col.sortKey
                          ? sortConfig.direction === 'asc' ? '\u25B2' : '\u25BC'
                          : '\u21C5'}
                      </span>
                    )}
                  </span>
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
            {sortedTransactions.map(t => {
              const usdVal = getUSD(t, fxRate)
              const copVal = parseFloat(t.amount)

              return (
                <tr
                  key={t.id}
                  className="group"
                  style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                >
                  {/* Date */}
                  <td style={{ padding: '12px 12px 12px 32px', color: 'var(--text-primary)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {formatDate(t.date)}
                  </td>

                  {/* Type badge */}
                  <td style={{ padding: '12px 12px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        ...(EVENT_BADGE_STYLE[t.event_type] || EVENT_BADGE_STYLE['Transfer']),
                      }}
                    >
                      {t.event_type.replace(/_/g, ' ')}
                    </span>
                  </td>

                  {/* Category */}
                  <td style={{ padding: '12px 12px', color: 'var(--text-primary)', fontSize: '12px' }}>
                    {t.level_2}
                  </td>

                  {/* Subcategory */}
                  <td style={{ padding: '12px 12px', color: 'var(--text-primary)', fontSize: '12px' }}>
                    {t.level_3 || '\u2014'}
                  </td>

                  {/* From */}
                  <td style={{ padding: '12px 12px', color: 'var(--text-primary)', fontSize: '12px' }}>
                    {t.from_account || '\u2014'}
                  </td>

                  {/* To */}
                  <td style={{ padding: '12px 12px', color: 'var(--text-primary)', fontSize: '12px' }}>
                    {t.to_account || '\u2014'}
                  </td>

                  {/* Amount USD */}
                  <td style={{ padding: '12px 12px', textAlign: 'right', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                    {formatUSD(usdVal)}
                  </td>

                  {/* Amount COP */}
                  <td style={{ padding: '12px 12px', textAlign: 'right', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {formatCOP(copVal)}
                  </td>

                  {/* Notes */}
                  <td style={{ padding: '12px 12px', color: 'var(--text-primary)', fontSize: '12px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span title={t.notes || ''}>
                      {t.notes || '\u2014'}
                    </span>
                  </td>

                  {/* Delete */}
                  <td style={{ padding: '12px 8px', width: '40px' }}>
                    <button
                      onClick={() => setDeleteId(t.id)}
                      className="opacity-0 group-hover:opacity-100"
                      style={{
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        transition: 'all 0.1s',
                      }}
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
