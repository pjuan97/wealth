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

interface DuplicateGroup {
  key: string
  transactions: Array<{
    id: number
    date: string
    event_type: string
    level_2: string
    level_3: string | null
    amount: number
    usd_amount: number | null
    from_account: string | null
    to_account: string | null
    notes: string | null
    month_label: string
  }>
}

// event_type -> the CategoryDef.level_1 bucket it draws its Level 2 options from.
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

function getCurrentMonth(): string {
  const todayKey = new Date().toISOString().slice(0, 7)
  const keys = MONTHS.map(m => m.key)
  if (keys.includes(todayKey)) return todayKey
  return todayKey < keys[0] ? keys[0] : keys[keys.length - 1]
}

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

function InlineEditCell({
  value,
  type = 'text',
  options,
  onSave,
}: {
  value: string | null
  type?: 'text' | 'select' | 'number'
  options?: string[]
  onSave: (v: string | null) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState(value || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave(raw || null)
    setSaving(false)
    setEditing(false)
  }

  const baseStyle: React.CSSProperties = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--accent-border)',
    borderRadius: '4px',
    padding: '3px 6px',
    color: 'var(--text-primary)',
    fontSize: '12px',
    outline: 'none',
    width: '100%',
    minWidth: '80px',
  }

  if (!editing) {
    return (
      <span
        onDoubleClick={() => { setRaw(value || ''); setEditing(true) }}
        title="Double-click to edit"
        style={{
          cursor: 'text',
          color: saving ? 'var(--text-muted)' : 'var(--text-primary)',
          fontSize: '12px',
          display: 'block',
          minWidth: '60px',
        }}
      >
        {value || '\u2014'}
      </span>
    )
  }

  if (type === 'select' && options) {
    return (
      <select
        autoFocus
        value={raw}
        onChange={e => setRaw(e.target.value)}
        onBlur={handleSave}
        style={{ ...baseStyle, cursor: 'pointer' }}
      >
        <option value="">\u2014</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  return (
    <input
      autoFocus
      type={type}
      value={raw}
      onChange={e => setRaw(e.target.value)}
      onBlur={handleSave}
      onKeyDown={e => {
        if (e.key === 'Enter') handleSave()
        if (e.key === 'Escape') setEditing(false)
      }}
      style={baseStyle}
    />
  )
}

export default function TransactionsPage() {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [fxRate, setFxRate] = useState<number | null>(null)
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serverSummary, setServerSummary] = useState<{
    income: number
    incomeUsd: number
    expense: number
    expenseUsd: number
    balance: number
    balanceUsd: number
    count: number
  } | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // ── Duplicate detection ────────────────────────────────────────────────────
  const [duplicateIds, setDuplicateIds] = useState<Set<number>>(new Set())
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [loadingDuplicates, setLoadingDuplicates] = useState(false)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)

  // ── Data Source options for inline editing ────────────────────────────────
  const [dataSourceOptions, setDataSourceOptions] = useState<{
    eventTypes: string[]
    level2: string[]
    level2ByLevel1: Record<string, string[]>
    accounts: string[]
    level3ByLevel2: Record<string, string[]>
  }>({
    eventTypes: [],
    level2: [],
    level2ByLevel1: {},
    accounts: [],
    level3ByLevel2: {},
  })

  useEffect(() => {
    fetch('/api/data-source').then(r => r.json()).then(data => {
      const eventTypes = (data.eventTypes || [])
        .filter((e: {is_active: boolean}) => e.is_active)
        .map((e: {name: string}) => e.name)
      const accounts = (data.accounts || [])
        .filter((a: {is_active: boolean}) => a.is_active)
        .map((a: {name: string}) => a.name)
      const categories = data.categories || []
      const level2 = [...new Set(categories.map((c: {level_2: string}) => c.level_2))] as string[]

      const level2ByLevel1: Record<string, string[]> = {}
      const level3ByLevel2: Record<string, string[]> = {}
      for (const cat of categories) {
        if (!level2ByLevel1[cat.level_1]) level2ByLevel1[cat.level_1] = []
        if (!level2ByLevel1[cat.level_1].includes(cat.level_2)) {
          level2ByLevel1[cat.level_1].push(cat.level_2)
        }
        if (!level3ByLevel2[cat.level_2]) level3ByLevel2[cat.level_2] = []
        if (cat.level_3 && !level3ByLevel2[cat.level_2].includes(cat.level_3)) {
          level3ByLevel2[cat.level_2].push(cat.level_3)
        }
      }

      setDataSourceOptions({ eventTypes, level2, level2ByLevel1, accounts, level3ByLevel2 })
    }).catch(console.error)
  }, [])

  // ── Inline edit ───────────────────────────────────────────────────────────
  const updateTransactionField = async (
    txId: number,
    field: string,
    value: string | number | null
  ) => {
    await fetch(`/api/transactions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: txId, [field]: value }),
    })
    setTransactions(prev => prev.map(tx =>
      tx.id === txId ? { ...tx, [field]: value } : tx
    ))
  }

  const detectDuplicates = async () => {
    if (showDuplicates) {
      setShowDuplicates(false)
      setDuplicateIds(new Set())
      setDuplicateCount(0)
      setDuplicateGroups([])
      return
    }

    setLoadingDuplicates(true)
    try {
      const res = await fetch('/api/transactions/duplicates')
      const data = await res.json()
      setDuplicateIds(new Set(data.duplicateIds))
      setDuplicateCount(data.pairs)
      setDuplicateGroups(data.groups || [])
      setShowDuplicates(true)
      if (data.pairs > 0) setShowDuplicateModal(true)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingDuplicates(false)
    }
  }

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
      if (!cursor) {
        setFxRate(json.fxRate)
        setServerSummary(json.summary || null)
      }
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

  // Totals: use server summary for full-month accuracy, fall back to local for filtered views
  const useServerSummary = serverSummary && !hasActiveFilters

  const localIncomeRows = filtered.filter(t => t.event_type === 'Income')
  const localExpenseRows = filtered.filter(t => t.event_type === 'Expense')
  const localIncomeCOP = localIncomeRows.reduce((s, t) => s + parseFloat(t.amount), 0)
  const localExpenseCOP = localExpenseRows.reduce((s, t) => s + parseFloat(t.amount), 0)
  const localIncomeUSD = localIncomeRows.reduce((s, t) => s + getUSD(t, fxRate), 0)
  const localExpenseUSD = localExpenseRows.reduce((s, t) => s + getUSD(t, fxRate), 0)

  const totalIncomeCOP = useServerSummary ? serverSummary.income : localIncomeCOP
  const totalExpenseCOP = useServerSummary ? serverSummary.expense : localExpenseCOP
  const totalIncomeUSD = useServerSummary ? serverSummary.incomeUsd : localIncomeUSD
  const totalExpenseUSD = useServerSummary ? serverSummary.expenseUsd : localExpenseUSD
  const balanceCOP = useServerSummary ? serverSummary.balance : (localIncomeCOP - localExpenseCOP)
  const balanceUSD = useServerSummary ? serverSummary.balanceUsd : (localIncomeUSD - localExpenseUSD)
  const totalCount = useServerSummary ? serverSummary.count : filtered.length

  const monthLabel = (MONTHS.find(m => m.key === selectedMonth)?.label || '') + ' 2026'

  // ── CSV Export ──────────────────────────────────────────────────────────────
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportRange, setExportRange] = useState<'current' | 'all' | 'range'>('current')
  const [exportFrom, setExportFrom] = useState('2026-01')
  const [exportTo, setExportTo] = useState('2026-12')
  const [exporting, setExporting] = useState(false)

  const exportCSV = async (range: 'current' | 'all' | 'range', from?: string, to?: string) => {
    setExporting(true)
    try {
      let url = '/api/transactions/export'
      if (range === 'current') url += `?month=${selectedMonth}`
      else if (range === 'range') url += `?from=${from}&to=${to}`

      const res = await fetch(url)
      const data = await res.json()
      const txs: Transaction[] = data.transactions || []

      const headers = [
        'id', 'date', 'month_label', 'event_type', 'level_1', 'level_2', 'level_3',
        'usd_amount', 'fx_rate', 'amount', 'from_account', 'to_account', 'notes'
      ]

      const rows = txs.map(tx => [
        tx.id,
        tx.date ? new Date(tx.date).toISOString().split('T')[0] : '',
        tx.month_label || '',
        tx.event_type || '',
        tx.level_1 || '',
        tx.level_2 || '',
        tx.level_3 || '',
        tx.usd_amount ?? '',
        tx.fx_rate ?? '',
        tx.amount ?? '',
        tx.from_account || '',
        tx.to_account || '',
        `"${(tx.notes || '').replace(/"/g, '""')}"`,
      ])

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
      const dlUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = dlUrl
      const filename = range === 'current'
        ? `transactions_${selectedMonth}.csv`
        : range === 'all'
        ? 'transactions_all.csv'
        : `transactions_${from}_to_${to}.csv`
      a.download = filename
      a.click()
      URL.revokeObjectURL(dlUrl)
      setShowExportModal(false)
    } catch (e) {
      console.error(e)
    } finally {
      setExporting(false)
    }
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
    // bg-elevated + shadow instead of bg-base, so the frozen header visibly
    // separates from rows scrolling underneath rather than blending in.
    background: 'var(--bg-elevated)',
    zIndex: 10,
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '10px 10px 4px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border-strong)',
    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
  }

  return (
    <div className="flex flex-col h-screen">

      {/* Page header */}
      <div style={{
        padding: '20px 32px 0',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div className="header-row" style={{ marginBottom: '12px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Transactions
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {monthLabel}
            </p>
          </div>
          <div className="header-row-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
              onClick={() => setShowExportModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-strong)',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              ↓ Export CSV
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
              onClick={detectDuplicates}
              disabled={loadingDuplicates}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: showDuplicates ? 'var(--accent-subtle)' : 'transparent',
                color: showDuplicates ? 'var(--accent)' : 'var(--text-secondary)',
                border: showDuplicates
                  ? '1px solid var(--accent-border)'
                  : '1px solid var(--border-strong)',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: loadingDuplicates ? 'wait' : 'pointer',
              }}
            >
              {loadingDuplicates
                ? '\u23F3 Scanning\u2026'
                : showDuplicates
                ? `\u26A0\uFE0F ${duplicateCount} duplicate${duplicateCount !== 1 ? 's' : ''} \u00B7 Clear`
                : '\uD83D\uDD0D Find Duplicates'}
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
      <div className="g-4" style={{
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
            count: totalCount,
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

      {/* Duplicate banner */}
      {showDuplicates && duplicateCount > 0 && (
        <div style={{
          padding: '10px 32px',
          background: 'var(--accent-subtle)',
          borderBottom: '1px solid var(--accent-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <p style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600 }}>
            {'\u26A0\uFE0F'} {duplicateCount} possible duplicate pair{duplicateCount !== 1 ? 's' : ''} found
            <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '8px' }}>
              &middot; Matching on: same date + same amount + same notes
            </span>
          </p>
          <button
            onClick={() => {
              setShowDuplicates(false)
              setDuplicateIds(new Set())
              setDuplicateCount(0)
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              textDecoration: 'underline',
            }}
          >
            Clear highlights
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '13px', minWidth: '1100px' }}>
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
              background: 'var(--bg-elevated)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
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
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: showDuplicates && duplicateIds.has(t.id)
                      ? 'rgba(249, 115, 22, 0.08)'
                      : 'transparent',
                    outline: showDuplicates && duplicateIds.has(t.id)
                      ? '1px solid var(--accent-border)'
                      : 'none',
                  }}
                  onMouseEnter={e => {
                    if (!(showDuplicates && duplicateIds.has(t.id))) {
                      (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'
                    }
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background =
                      showDuplicates && duplicateIds.has(t.id)
                        ? 'rgba(249, 115, 22, 0.08)'
                        : 'transparent'
                  }}
                >
                  {/* Date */}
                  <td style={{ padding: '12px 12px 12px 32px', color: 'var(--text-primary)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {formatDate(t.date)}
                  </td>

                  {/* Type */}
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    <InlineEditCell
                      value={t.event_type}
                      type="select"
                      options={dataSourceOptions.eventTypes}
                      onSave={v => updateTransactionField(t.id, 'event_type', v)}
                    />
                  </td>

                  {/* Category (level_2) — filtered by event_type */}
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    <InlineEditCell
                      value={t.level_2}
                      type="select"
                      options={dataSourceOptions.level2ByLevel1[EVENT_TYPE_TO_LEVEL1[t.event_type || ''] || t.event_type || ''] || dataSourceOptions.level2}
                      onSave={async v => {
                        await updateTransactionField(t.id, 'level_2', v)
                        // Reset level_3 if not valid for new level_2
                        const validL3 = dataSourceOptions.level3ByLevel2[v || ''] || []
                        if (t.level_3 && !validL3.includes(t.level_3)) {
                          await updateTransactionField(t.id, 'level_3', null)
                        }
                      }}
                    />
                  </td>

                  {/* Subcategory (level_3) */}
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    <InlineEditCell
                      value={t.level_3}
                      type="select"
                      options={dataSourceOptions.level3ByLevel2[t.level_2 || ''] || []}
                      onSave={v => updateTransactionField(t.id, 'level_3', v)}
                    />
                  </td>

                  {/* From */}
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    <InlineEditCell
                      value={t.from_account}
                      type="select"
                      options={dataSourceOptions.accounts}
                      onSave={v => updateTransactionField(t.id, 'from_account', v)}
                    />
                  </td>

                  {/* To */}
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    <InlineEditCell
                      value={t.to_account}
                      type="select"
                      options={dataSourceOptions.accounts}
                      onSave={v => updateTransactionField(t.id, 'to_account', v)}
                    />
                  </td>

                  {/* Amount USD */}
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                    <InlineEditCell
                      value={t.usd_amount ? String(t.usd_amount) : null}
                      type="number"
                      onSave={v => updateTransactionField(t.id, 'usd_amount', v ? parseFloat(v) : null)}
                    />
                  </td>

                  {/* Amount COP */}
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                    <InlineEditCell
                      value={t.amount ? String(t.amount) : null}
                      type="number"
                      onSave={v => updateTransactionField(t.id, 'amount', v ? parseFloat(v) : null)}
                    />
                  </td>

                  {/* Notes */}
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', minWidth: '160px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {showDuplicates && duplicateIds.has(t.id) && (
                        <span style={{
                          flexShrink: 0,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          fontSize: '9px',
                          fontWeight: 700,
                          background: 'var(--accent)',
                          color: '#ffffff',
                        }}>
                          DUP
                        </span>
                      )}
                      <InlineEditCell
                        value={t.notes}
                        type="text"
                        onSave={v => updateTransactionField(t.id, 'notes', v)}
                      />
                    </div>
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

      {/* Export CSV modal */}
      {showExportModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '24px',
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: '16px',
            padding: '28px 32px',
            width: '420px',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Export Transactions
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Selecciona el rango de transacciones a exportar
            </p>

            {/* Range selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {([
                { key: 'current', label: `Mes actual (${selectedMonth})`, sub: 'Solo las transacciones del mes visible' },
                { key: 'all', label: 'Todas las transacciones', sub: 'Historial completo incluyendo años anteriores' },
                { key: 'range', label: 'Rango personalizado', sub: 'Elige desde y hasta qué mes' },
              ] as const).map(opt => (
                <div
                  key={opt.key}
                  onClick={() => setExportRange(opt.key)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: exportRange === opt.key
                      ? '1px solid var(--accent-border)'
                      : '1px solid var(--border)',
                    background: exportRange === opt.key ? 'var(--accent-subtle)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '12px',
                  }}
                >
                  <div style={{
                    width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                    border: exportRange === opt.key ? 'none' : '2px solid var(--border-strong)',
                    background: exportRange === opt.key ? 'var(--accent)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {exportRange === opt.key && (
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />
                    )}
                  </div>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{opt.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Range pickers */}
            {exportRange === 'range' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Desde</label>
                  <select
                    value={exportFrom}
                    onChange={e => setExportFrom(e.target.value)}
                    style={{
                      width: '100%', background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-strong)', borderRadius: '6px',
                      padding: '7px 10px', color: 'var(--text-primary)', fontSize: '12px', outline: 'none',
                    }}
                  >
                    {['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
                      '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Hasta</label>
                  <select
                    value={exportTo}
                    onChange={e => setExportTo(e.target.value)}
                    style={{
                      width: '100%', background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-strong)', borderRadius: '6px',
                      padding: '7px 10px', color: 'var(--text-primary)', fontSize: '12px', outline: 'none',
                    }}
                  >
                    {['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
                      '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12']
                      .filter(m => m >= exportFrom)
                      .map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowExportModal(false)}
                style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
                  background: 'transparent', border: '1px solid var(--border-strong)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => exportCSV(exportRange, exportFrom, exportTo)}
                disabled={exporting}
                style={{
                  padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: exporting ? 'var(--bg-elevated)' : 'var(--accent)',
                  color: exporting ? 'var(--text-muted)' : '#ffffff',
                  border: 'none', cursor: exporting ? 'not-allowed' : 'pointer',
                }}
              >
                {exporting ? 'Exportando...' : '↓ Exportar CSV'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate groups modal */}
      {showDuplicateModal && duplicateGroups.length > 0 && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '24px',
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: '16px',
            width: '100%', maxWidth: '900px',
            maxHeight: '85vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', flexShrink: 0,
            }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Duplicate Transactions
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {duplicateGroups.length} group{duplicateGroups.length !== 1 ? 's' : ''} found
                  {' \u00B7 '}Matching on: same date + same amount + same notes
                </p>
              </div>
              <button
                onClick={() => setShowDuplicateModal(false)}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--text-muted)', cursor: 'pointer',
                  fontSize: '20px', lineHeight: 1, padding: '0 4px',
                }}
              >{'\u00D7'}</button>
            </div>

            {/* Groups */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {duplicateGroups.map((group, gi) => (
                <div key={gi} style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--accent-border)',
                  borderRadius: '10px', overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '10px 16px',
                    background: 'var(--accent-subtle)',
                    borderBottom: '1px solid var(--accent-border)',
                    display: 'flex', alignItems: 'center', gap: '10px',
                  }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px',
                      fontSize: '10px', fontWeight: 700,
                      background: 'var(--accent)', color: '#ffffff',
                    }}>
                      {group.transactions.length} duplicates
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      &quot;{group.transactions[0].notes}&quot;
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {new Date(group.transactions[0].date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {' \u00B7 '}{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(group.transactions[0].amount))}
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead>
                      <tr>
                        {['ID', 'Date', 'Type', 'Category', 'Subcategory', 'Amount COP', 'USD', 'From', 'To'].map((h, i) => (
                          <th key={h} style={{
                            padding: '8px 12px', fontSize: '10px',
                            fontWeight: 700, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                            textAlign: i >= 5 ? 'right' : 'left',
                            borderBottom: '1px solid var(--border)',
                          }}>{h}</th>
                        ))}
                        <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', width: '80px' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {group.transactions.map((tx, ti) => (
                        <tr key={tx.id} style={{
                          borderBottom: ti < group.transactions.length - 1 ? '1px solid var(--border)' : 'none',
                          background: ti % 2 === 0 ? 'transparent' : 'rgba(148,163,184,0.03)',
                        }}>
                          <td style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-muted)' }}>#{tx.id}</td>
                          <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-primary)' }}>
                            {new Date(tx.date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {tx.event_type?.replace(/_/g, ' ')}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-secondary)' }}>{tx.level_2}</td>
                          <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{tx.level_3 || '\u2014'}</td>
                          <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(tx.amount))}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {tx.usd_amount ? `${Number(tx.usd_amount).toFixed(2)}` : '\u2014'}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-muted)' }}>{tx.from_account || '\u2014'}</td>
                          <td style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-muted)' }}>{tx.to_account || '\u2014'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            <button
                              onClick={async () => {
                                if (!confirm(`Delete transaction #${tx.id}? This cannot be undone.`)) return
                                await fetch(`/api/transactions?id=${tx.id}`, { method: 'DELETE' })
                                setDuplicateGroups(prev => {
                                  const updated = prev.map(g => ({
                                    ...g,
                                    transactions: g.transactions.filter(t => t.id !== tx.id),
                                  })).filter(g => g.transactions.length >= 2)
                                  return updated
                                })
                                await fetchTransactions(selectedMonth)
                              }}
                              style={{
                                padding: '3px 10px', borderRadius: '4px',
                                fontSize: '11px', fontWeight: 500,
                                background: 'transparent',
                                border: '1px solid var(--border-strong)',
                                color: 'var(--text-muted)', cursor: 'pointer',
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 24px', borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'flex-end', flexShrink: 0,
            }}>
              <button
                onClick={() => setShowDuplicateModal(false)}
                style={{
                  padding: '8px 20px', borderRadius: '8px',
                  fontSize: '13px', fontWeight: 600,
                  background: 'var(--accent)', color: '#ffffff',
                  border: 'none', cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

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
