'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useCurrencyPreference } from '@/app/components/CurrencyPreferenceProvider'

// ─── Types ────────────────────────────────────────────────────────────────────
type Currency = 'COP' | 'USD'

interface MonthlySummary {
  month: string; label: string
  income: number; expense: number; balance: number; savingsRate: number
}
interface IncomeSource {
  month: string; label: string; salary: number; other: number
}
interface PlanVsExecRaw {
  month: string; label: string
  incomePlanCOP: number; incomePlanUSD: number
  expensePlanCOP: number; expensePlanUSD: number
  incomeExecCOP: number; incomeExecUSD: number
  expenseExecCOP: number; expenseExecUSD: number
}
interface PlanVsExec {
  month: string; label: string
  incomePlan: number; incomeExec: number
  expensePlan: number; expenseExec: number
  incomeVariance: number | null; expenseVariance: number | null
}
// Expense-by-category breakdown — categories are this user's own Level 2
// list (from Data Source), not a fixed English set.
interface ExpenseByL2 {
  month: string; label: string; byLevel2: Record<string, number>
}
interface MonthlyRow {
  event_type: string; level_2: string; level_3: string | null; currency: Currency
  plan: number; executed: number; diff: number
  variance: number | null; achievement: number | null
}
interface ExpenseByCat {
  month: string; label: string; byLevel2: Record<string, number>
}
interface EquityMonthData {
  month: string; label: string
  planned: number; executed: number | null; marketPnL: number | null
}
interface EquityAccount {
  account: string; equity_type: string
  monthData: EquityMonthData[]
  latestPlanned: number; latestExecuted: number | null
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = [
  '2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
  '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12',
]
function getCurrentMonth(): string {
  const todayKey = new Date().toISOString().slice(0, 7)
  if (MONTHS.includes(todayKey)) return todayKey
  return todayKey < MONTHS[0] ? MONTHS[0] : MONTHS[MONTHS.length - 1]
}
const CURRENT_MONTH = getCurrentMonth()
const MONTH_LABELS: Record<string, string> = {
  '2026-01':'January','2026-02':'February','2026-03':'March','2026-04':'April',
  '2026-05':'May','2026-06':'June','2026-07':'July','2026-08':'August',
  '2026-09':'September','2026-10':'October','2026-11':'November','2026-12':'December',
}
const CHART_COLORS = ['#f97316','#94a3b8','#475569','#cbd5e1','#e2e8f0','#334155']
const PIE_COLORS = ['#f97316','#94a3b8','#64748b','#475569']

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fCOP(n: number): string {
  if (n === 0) return '$0'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

function fM(n: number): string {
  if (n === 0) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${n < 0 ? '-' : ''}${(abs/1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${n < 0 ? '-' : ''}${(abs/1_000).toFixed(0)}K`
  return fCOP(n)
}

function fUSD(n: number): string {
  if (n === 0) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

function fMoney(n: number, currency: Currency): string {
  return currency === 'USD' ? fUSD(n) : fCOP(n)
}

// Compact K/M form, currency-aware — same abbreviation thresholds `fM` uses
// for COP, but USD never needs the M suffix at realistic personal-finance scale.
function fMc(n: number, currency: Currency): string {
  if (n === 0) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (currency === 'USD') {
    if (abs >= 1000) return `${sign}$${(abs/1000).toFixed(1)}K`
    return `${sign}$${abs.toFixed(0)}`
  }
  return fM(n)
}

function fPct(n: number | null): string {
  if (n === null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function varianceColor(v: number | null, type: 'income' | 'expense'): string {
  if (v === null) return 'var(--text-muted)'
  const good = type === 'income' ? v >= 0 : v <= 0
  if (Math.abs(v) <= 0.05) return 'var(--text-primary)'
  return good ? 'var(--accent)' : 'var(--text-secondary)'
}

// ─── Chart Tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, currency = 'COP' }: {
  active?: boolean; payload?: Array<{name: string; value: number; color: string}>; label?: string
  currency?: Currency
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
      borderRadius: '8px', padding: '10px 14px', fontSize: '12px',
    }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '2px' }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fMc(p.value, currency)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function Card({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: '14px', overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</p>
        {subtitle && <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{subtitle}</p>}
      </div>
      <div className="card-body" style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: boolean
}) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: `1px solid ${accent ? 'var(--accent-border)' : 'var(--border)'}`,
      borderLeft: `3px solid ${accent ? 'var(--accent)' : 'var(--border-strong)'}`,
      borderRadius: '10px', padding: '14px 18px',
    }}>
      <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
        {label}
      </p>
      <p style={{ fontSize: '18px', fontWeight: 800, color: accent ? 'var(--accent)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px' }}>{sub}</p>}
    </div>
  )
}

// ─── Tab button ───────────────────────────────────────────────────────────────
function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 20px', fontSize: '13px', fontWeight: 500,
      cursor: 'pointer', background: 'transparent', border: 'none',
      borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
      color: active ? 'var(--accent)' : 'var(--text-secondary)',
      marginBottom: '-1px', whiteSpace: 'nowrap',
    }}>
      {label}
    </button>
  )
}

// ─── Mini table ───────────────────────────────────────────────────────────────
function MiniTable({ headers, rows }: {
  headers: string[]
  rows: Array<Array<{ value: string; color?: string; bold?: boolean }>>
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="mini-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '11px' }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '6px 8px', textAlign: i === 0 ? 'left' : 'right',
                color: 'var(--text-muted)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: '6px 8px', textAlign: j === 0 ? 'left' : 'right',
                  color: cell.color || 'var(--text-primary)',
                  fontWeight: cell.bold ? 700 : 400,
                  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                }}>
                  {cell.value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────────
const CATEGORY_LINE_COLORS = ['#f97316', '#38bdf8', '#a78bfa', '#34d399', '#facc15', '#fb7185']

function OverviewTab() {
  const { displayCurrency, convert } = useCurrencyPreference()
  const [data, setData] = useState<{
    monthlySummary: MonthlySummary[]
    incomeBySource: IncomeSource[]
    expenseByCategory: ExpenseByCat[]
    expenseCategories: string[]
    ytd: { income: number; expense: number; balance: number; savingsRate: number; months: number }
    netWorth: number; cashBalance: number; totalEquity: number
  } | null>(null)

  useEffect(() => {
    fetch('/api/dashboard?section=overview').then(r => r.json()).then(setData)
  }, [])

  if (!data) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>

  const money = (n: number) => fMc(n, displayCurrency)
  const cats = data.expenseCategories

  // Every figure here is a real COP amount (transactions always carry a valid
  // COP-equivalent) — convert per row using that row's own month's TRM.
  const withData = data.monthlySummary
    .filter(m => m.income > 0 || m.expense > 0)
    .map(m => ({
      ...m,
      income: convert(m.income, 'COP', m.month),
      expense: convert(m.expense, 'COP', m.month),
      balance: convert(m.balance, 'COP', m.month),
    }))
  const incomeBySourceConverted = data.incomeBySource.map(s => ({
    ...s,
    salary: convert(s.salary, 'COP', s.month),
    other: convert(s.other, 'COP', s.month),
  }))
  const expenseByCategoryConverted = data.expenseByCategory.map(row => ({
    ...row,
    byLevel2: Object.fromEntries(cats.map(cat => [cat, convert(row.byLevel2[cat] || 0, 'COP', row.month)])),
  }))
  // Point-in-time / multi-month aggregates have no single owning month —
  // fall back to the overall average TRM.
  const netWorth = convert(data.netWorth, 'COP')
  const cashBalance = convert(data.cashBalance, 'COP')
  const totalEquity = convert(data.totalEquity, 'COP')
  const ytd = {
    income: convert(data.ytd.income, 'COP'),
    expense: convert(data.ytd.expense, 'COP'),
    balance: convert(data.ytd.balance, 'COP'),
    savingsRate: data.ytd.savingsRate,
    months: data.ytd.months,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* KPI row */}
      <div className="g-5" style={{ gap: '12px' }}>
        <KpiCard label="Net Worth" value={money(netWorth)} accent />
        <KpiCard label="YTD Income" value={money(ytd.income)} sub={`${ytd.months} months`} />
        <KpiCard label="YTD Expense" value={money(ytd.expense)} />
        <KpiCard label="YTD Balance" value={money(ytd.balance)} />
        <KpiCard label="Savings Rate" value={fPct(ytd.savingsRate)} />
      </div>

      {/* Income vs Expense chart + table */}
      <div className="g-main-side" style={{ gap: '16px' }}>
        <Card title="Income vs Expense vs Balance" subtitle="Monthly">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={withData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={money} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip currency={displayCurrency} />} />
              <Legend wrapperStyle={{ fontSize: '11px', color: 'var(--text-secondary)' }} />
              <Bar dataKey="income" name="Income" fill={CHART_COLORS[0]} radius={[3,3,0,0]} />
              <Bar dataKey="expense" name="Expense" fill={CHART_COLORS[1]} radius={[3,3,0,0]} />
              <Bar dataKey="balance" name="Balance" fill={CHART_COLORS[2]} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Monthly Summary">
          <MiniTable
            headers={['Month', 'Income', 'Expense', 'Balance', 'Savings']}
            rows={withData.map(m => [
              { value: m.label },
              { value: money(m.income) },
              { value: money(m.expense), color: 'var(--text-secondary)' },
              { value: money(m.balance), color: m.balance >= 0 ? 'var(--accent)' : 'var(--text-secondary)', bold: true },
              { value: fPct(m.savingsRate), color: m.savingsRate >= 0.2 ? 'var(--accent)' : 'var(--text-secondary)' },
            ])}
          />
        </Card>
      </div>

      {/* Income by source chart + table */}
      <div className="g-main-side" style={{ gap: '16px' }}>
        <Card title="Income by Source" subtitle="Salary vs Other Incomes">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={withData.map(m => {
              const src = incomeBySourceConverted.find(s => s.month === m.month)
              return { ...m, salary: src?.salary || 0, other: src?.other || 0 }
            })} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="salaryGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.3}/>
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.02}/>
                </linearGradient>
                <linearGradient id="otherGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.2}/>
                  <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.02}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={money} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip currency={displayCurrency} />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Area type="monotone" dataKey="salary" name="Salary" stroke="#f97316" fill="url(#salaryGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="other" name="Other Incomes" stroke="#94a3b8" fill="url(#otherGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Income Sources YTD">
          <MiniTable
            headers={['Month', 'Salary', 'Other']}
            rows={withData.map(m => {
              const src = incomeBySourceConverted.find(s => s.month === m.month)
              return [
                { value: m.label },
                { value: money(src?.salary || 0) },
                { value: money(src?.other || 0), color: 'var(--text-secondary)' },
              ]
            })}
          />
        </Card>
      </div>

      {/* Expense by Category — line chart + table (categories are this user's own) */}
      <div className="g-main-side" style={{ gap: '16px' }}>
        <Card title="Expense by Category" subtitle={`${cats.join(' / ')} — monthly trend`}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={withData.map(m => {
                const exp = expenseByCategoryConverted.find(e => e.month === m.month)
                const row: Record<string, string | number> = { label: m.label }
                for (const cat of cats) row[cat] = exp?.byLevel2[cat] || 0
                return row
              })}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={money} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip currency={displayCurrency} />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              {cats.map((cat, i) => (
                <Line
                  key={cat} type="monotone" dataKey={cat}
                  stroke={CATEGORY_LINE_COLORS[i % CATEGORY_LINE_COLORS.length]} strokeWidth={2}
                  dot={{ r: 3, fill: CATEGORY_LINE_COLORS[i % CATEGORY_LINE_COLORS.length] }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Expense by Category YTD">
          <MiniTable
            headers={['Month', ...cats]}
            rows={withData.map(m => {
              const exp = expenseByCategoryConverted.find(e => e.month === m.month)
              return [
                { value: m.label },
                ...cats.map((cat, i) => ({
                  value: money(exp?.byLevel2[cat] || 0),
                  color: CATEGORY_LINE_COLORS[i % CATEGORY_LINE_COLORS.length],
                })),
              ]
            })}
          />
        </Card>
      </div>
    </div>
  )
}

// ─── PLAN TAB ─────────────────────────────────────────────────────────────────
function PlanTab() {
  const { displayCurrency, convert } = useCurrencyPreference()
  const [data, setData] = useState<{
    planVsExec: PlanVsExecRaw[]
    expenseByL2: ExpenseByL2[]
    expenseCategories: string[]
    categoryCurrency: Record<string, Currency>
  } | null>(null)

  useEffect(() => {
    fetch('/api/dashboard?section=plan').then(r => r.json()).then(setData)
  }, [])

  if (!data) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>

  const { expenseCategories: cats, categoryCurrency } = data
  const money = (n: number) => fMc(n, displayCurrency)

  // Merge each month's COP/USD pools into the chosen display currency using
  // that month's own TRM — no single "dominant" currency for the whole user.
  const planVsExec: PlanVsExec[] = data.planVsExec.map(m => {
    const incomePlan = convert(m.incomePlanCOP, 'COP', m.month) + convert(m.incomePlanUSD, 'USD', m.month)
    const incomeExec = convert(m.incomeExecCOP, 'COP', m.month) + convert(m.incomeExecUSD, 'USD', m.month)
    const expensePlan = convert(m.expensePlanCOP, 'COP', m.month) + convert(m.expensePlanUSD, 'USD', m.month)
    const expenseExec = convert(m.expenseExecCOP, 'COP', m.month) + convert(m.expenseExecUSD, 'USD', m.month)
    return {
      month: m.month, label: m.label, incomePlan, incomeExec, expensePlan, expenseExec,
      incomeVariance: incomePlan > 0 ? (incomeExec - incomePlan) / incomePlan : null,
      expenseVariance: expensePlan > 0 ? (expenseExec - expensePlan) / expensePlan : null,
    }
  })
  const withData = planVsExec.filter(m => m.incomePlan > 0 || m.incomeExec > 0)

  // Each category's raw byLevel2 value is in that category's own native
  // currency — convert per row using its own month before charting/summing.
  const expenseByL2: ExpenseByL2[] = data.expenseByL2.map(row => ({
    month: row.month, label: row.label,
    byLevel2: Object.fromEntries(cats.map(cat => [cat, convert(row.byLevel2[cat] || 0, categoryCurrency[cat] || 'COP', row.month)])),
  }))
  const expWithData = expenseByL2.filter(m => Object.values(m.byLevel2).reduce((s, v) => s + v, 0) > 0)

  // Expense pie YTD — one slice per category this user actually has
  const expensePieYTD = cats
    .map(cat => ({ name: cat, value: expWithData.reduce((s, m) => s + (m.byLevel2[cat] || 0), 0) }))
    .filter(e => e.value > 0)

  const totalExpenseYTD = expensePieYTD.reduce((s, e) => s + e.value, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Income Plan vs Executed */}
      <div className="g-main-side" style={{ gap: '16px' }}>
        <Card title="Income: Plan vs Executed" subtitle="Monthly comparison">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={withData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="incPlanGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.2}/>
                  <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.02}/>
                </linearGradient>
                <linearGradient id="incExecGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.3}/>
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.02}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={money} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip currency={displayCurrency} />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Area type="monotone" dataKey="incomePlan" name="Plan" stroke="#94a3b8" fill="url(#incPlanGrad)" strokeWidth={2} strokeDasharray="5 3" />
              <Area type="monotone" dataKey="incomeExec" name="Executed" stroke="#f97316" fill="url(#incExecGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Income Plan vs Exec">
          <MiniTable
            headers={['Month', 'Plan', 'Exec', 'Var%']}
            rows={withData.map(m => [
              { value: m.label },
              { value: money(m.incomePlan), color: 'var(--text-secondary)' },
              { value: money(m.incomeExec) },
              { value: fPct(m.incomeVariance), color: varianceColor(m.incomeVariance, 'income') },
            ])}
          />
        </Card>
      </div>

      {/* Expense Plan vs Executed */}
      <div className="g-main-side" style={{ gap: '16px' }}>
        <Card title="Expense: Plan vs Executed" subtitle="Monthly comparison">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={withData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="expPlanGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.2}/>
                  <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.02}/>
                </linearGradient>
                <linearGradient id="expExecGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.3}/>
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.02}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={money} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip currency={displayCurrency} />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Area type="monotone" dataKey="expensePlan" name="Plan" stroke="#94a3b8" fill="url(#expPlanGrad)" strokeWidth={2} strokeDasharray="5 3" />
              <Area type="monotone" dataKey="expenseExec" name="Executed" stroke="#f97316" fill="url(#expExecGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Expense Plan vs Exec">
          <MiniTable
            headers={['Month', 'Plan', 'Exec', 'Var%']}
            rows={withData.map(m => [
              { value: m.label },
              { value: money(m.expensePlan), color: 'var(--text-secondary)' },
              { value: money(m.expenseExec) },
              { value: fPct(m.expenseVariance), color: varianceColor(m.expenseVariance, 'expense') },
            ])}
          />
        </Card>
      </div>

      {/* Expense breakdown by category — categories are this user's own */}
      <div className="g-main-side" style={{ gap: '16px' }}>
        <Card title="Expense by Category" subtitle={cats.join(' / ')}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={expWithData.map(m => ({ label: m.label, ...m.byLevel2 }))}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={money} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip currency={displayCurrency} />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              {cats.map((cat, i) => (
                <Bar key={cat} dataKey={cat} name={cat} fill={CATEGORY_LINE_COLORS[i % CATEGORY_LINE_COLORS.length]} stackId="a" />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Expense Distribution YTD">
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={expensePieYTD}
                cx="50%" cy="50%"
                innerRadius={45} outerRadius={70}
                dataKey="value"
                label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}
                fontSize={10}
              >
                {expensePieYTD.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => money(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
            {expensePieYTD.map((e, i) => (
              <div key={e.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: PIE_COLORS[i % PIE_COLORS.length], fontWeight: 600 }}>● {e.name}</span>
                <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {money(e.value)} ({totalExpenseYTD > 0 ? ((e.value / totalExpenseYTD) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─── MONTHLY DETAIL TAB ──────────────────────────────────────────────────────
function MonthlyDetailTab() {
  const { displayCurrency, convert } = useCurrencyPreference()
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH)
  const [data, setData] = useState<{
    rows: MonthlyRow[]
    kpis: { incomeCOP: number; incomeUSD: number; expenseCOP: number; expenseUSD: number; month: string }
  } | null>(null)

  const loadMonth = useCallback(async (m: string) => {
    const res = await fetch(`/api/dashboard?section=monthly&month=${m}`)
    const d = await res.json()
    setData(d)
  }, [])

  useEffect(() => { loadMonth(selectedMonth) }, [selectedMonth, loadMonth])

  // Each row keeps its own native currency — convert into the display
  // currency using this month's own TRM before charting/summing.
  const rows = (data?.rows || []).map(r => ({
    ...r,
    plan: convert(r.plan, r.currency, selectedMonth),
    executed: convert(r.executed, r.currency, selectedMonth),
    diff: convert(r.diff, r.currency, selectedMonth),
  }))
  const expenseRows = rows.filter(r => r.event_type === 'Expense')
  const expensePie = expenseRows.filter(r => r.executed > 0).map(r => ({ name: r.level_3 || r.level_2, value: r.executed }))
  const totalExpense = expensePie.reduce((s, e) => s + e.value, 0)
  const kpis = data ? (() => {
    const income = convert(data.kpis.incomeCOP, 'COP', selectedMonth) + convert(data.kpis.incomeUSD, 'USD', selectedMonth)
    const expense = convert(data.kpis.expenseCOP, 'COP', selectedMonth) + convert(data.kpis.expenseUSD, 'USD', selectedMonth)
    return { income, expense, balance: income - expense }
  })() : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Month selector */}
      <div style={{
        display: 'flex', gap: '4px', overflowX: 'auto',
        background: 'var(--bg-surface)', borderRadius: '10px', padding: '8px',
        border: '1px solid var(--border)',
      }}>
        {MONTHS.map(m => (
          <button key={m} onClick={() => setSelectedMonth(m)} style={{
            padding: '6px 14px', borderRadius: '6px', fontSize: '12px',
            fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
            border: selectedMonth === m ? '1px solid var(--accent-border)' : '1px solid transparent',
            background: selectedMonth === m ? 'var(--accent-subtle)' : 'transparent',
            color: selectedMonth === m ? 'var(--accent)' : 'var(--text-secondary)',
          }}>
            {MONTH_LABELS[m]}
          </button>
        ))}
      </div>

      {!data ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="g-3" style={{ gap: '12px' }}>
            <KpiCard label="Income" value={fMoney(kpis!.income, displayCurrency)} />
            <KpiCard label="Expense" value={fMoney(kpis!.expense, displayCurrency)} />
            <KpiCard label="Balance" value={fMoney(kpis!.balance, displayCurrency)} accent={kpis!.balance >= 0} />
          </div>

          {/* Expense drilldown — full width layout */}
          <div className="g-2" style={{ gap: '16px', alignItems: 'start' }}>

            {/* Table — full height, no internal scroll */}
            <Card title={`Expenses — ${MONTH_LABELS[selectedMonth]}`} subtitle="Plan vs Executed by subcategory">
              <MiniTable
                headers={['Category', 'Plan', 'Executed', 'Diff', 'Var%']}
                rows={expenseRows.map(r => [
                  { value: r.level_3 || r.level_2 },
                  { value: fMc(r.plan, displayCurrency), color: 'var(--text-secondary)' },
                  { value: fMc(r.executed, displayCurrency), bold: r.executed > 0 },
                  {
                    value: r.diff !== 0 ? `${r.diff >= 0 ? '+' : ''}${fMc(r.diff, displayCurrency)}` : '—',
                    color: r.diff <= 0 ? 'var(--accent)' : 'var(--text-secondary)',
                  },
                  { value: fPct(r.variance), color: varianceColor(r.variance, 'expense') },
                ])}
              />
            </Card>

            {/* Horizontal bar chart — Plan vs Executed per subcategory */}
            <Card title="Plan vs Executed" subtitle="All subcategories">
              <ResponsiveContainer width="100%" height={Math.max(expenseRows.length * 28, 320)}>
                <BarChart
                  data={expenseRows.map(r => ({
                    name: r.level_3 || r.level_2,
                    plan: r.plan,
                    executed: r.executed,
                  }))}
                  layout="vertical"
                  margin={{ top: 0, right: 16, bottom: 0, left: 120 }}
                >
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.1)" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(n: number) => fMc(n, displayCurrency)}
                    tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: 'var(--text-primary)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={116}
                  />
                  <Tooltip content={<ChartTooltip currency={displayCurrency} />} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="plan" name="Plan" fill="#94a3b8" radius={[0,3,3,0]} barSize={8} />
                  <Bar dataKey="executed" name="Executed" fill="#f97316" radius={[0,3,3,0]} barSize={8} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

          </div>
        </>
      )}
    </div>
  )
}

// ─── EQUITY TAB ───────────────────────────────────────────────────────────────
function EquityTab() {
  const { displayCurrency, convert } = useCurrencyPreference()
  const [data, setData] = useState<{
    portfolioByMonth: Array<{ month: string; label: string; planned: number; executed: number | null }>
    byAccount: EquityAccount[]
    distributionPie: Array<{ name: string; value: number }>
    accounts: string[]
  } | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard?section=equity').then(r => r.json()).then(d => {
      setData(d)
      if (d.accounts?.length > 0) setSelectedAccount(d.accounts[0])
    })
  }, [])

  if (!data) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>

  // Equity accounts are always COP-native (no per-row currency) — convert per
  // month using that month's own TRM; point-in-time figures with no month
  // attached fall back to the overall average TRM.
  const money = (n: number) => fMc(n, displayCurrency)
  const withData = data.portfolioByMonth
    .filter(m => m.planned > 0)
    .map(m => ({ ...m, planned: convert(m.planned, 'COP', m.month), executed: m.executed !== null ? convert(m.executed, 'COP', m.month) : null }))
  const distributionPie = data.distributionPie.map(e => ({ ...e, value: convert(e.value, 'COP') }))
  const totalLatest = distributionPie.reduce((s, e) => s + e.value, 0)
  const byAccount = data.byAccount.map(a => ({
    ...a,
    monthData: a.monthData.map(m => ({
      ...m,
      planned: convert(m.planned, 'COP', m.month),
      executed: m.executed !== null ? convert(m.executed, 'COP', m.month) : null,
      marketPnL: m.marketPnL !== null ? convert(m.marketPnL, 'COP', m.month) : null,
    })),
    latestExecuted: a.latestExecuted !== null ? convert(a.latestExecuted, 'COP') : null,
  }))
  const selectedAccountData = byAccount.find(a => a.account === selectedAccount)
  const accountMonthData = selectedAccountData?.monthData.filter(m => m.planned > 0) || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Portfolio KPIs */}
      <div className="g-4" style={{ gap: '12px' }}>
        {byAccount.filter(a => a.latestExecuted !== null).map(a => (
          <KpiCard
            key={a.account}
            label={a.account}
            value={money(a.latestExecuted!)}
            sub={a.equity_type}
            accent={a.account === selectedAccount}
          />
        ))}
      </div>

      {/* Portfolio evolution + distribution */}
      <div className="g-main-side" style={{ gap: '16px' }}>
        <Card title="Portfolio: Planned vs Executed" subtitle="All accounts combined">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={withData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={money} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={56} />
              <Tooltip content={<ChartTooltip currency={displayCurrency} />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line type="monotone" dataKey="planned" name="Planned" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 3" dot={false} />
              <Line type="monotone" dataKey="executed" name="Executed" stroke="#f97316" strokeWidth={2.5} dot={{ fill: '#f97316', r: 4 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Portfolio Distribution">
          {data.distributionPie.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={distributionPie}
                    cx="50%" cy="50%"
                    innerRadius={40} outerRadius={65}
                    dataKey="value"
                  >
                    {distributionPie.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => money(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                {distributionPie.map((e, i) => (
                  <div key={e.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: CHART_COLORS[i] }}>● {e.name}</span>
                    <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {totalLatest > 0 ? ((e.value / totalLatest) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '40px 0' }}>
              No data yet — enter Cierre Real in Equity
            </p>
          )}
        </Card>
      </div>

      {/* Account selector + individual chart */}
      <div className="g-main-side" style={{ gap: '16px' }}>
        <Card
          title={`${selectedAccount || '—'}: Planned vs Executed`}
          subtitle="Select account below"
        >
          {/* Account tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {data.accounts.map(acc => (
              <button
                key={acc}
                onClick={() => setSelectedAccount(acc)}
                style={{
                  padding: '4px 12px', borderRadius: '6px', fontSize: '11px',
                  fontWeight: 500, cursor: 'pointer',
                  border: selectedAccount === acc ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                  background: selectedAccount === acc ? 'var(--accent-subtle)' : 'transparent',
                  color: selectedAccount === acc ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                {acc}
              </button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={accountMonthData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={money} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip currency={displayCurrency} />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="planned" name="Planned" fill="#94a3b8" radius={[3,3,0,0]} />
              <Bar dataKey="executed" name="Executed" fill="#f97316" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title={`${selectedAccount || '—'} Performance`}>
          {selectedAccountData && (
            <MiniTable
              headers={['Month', 'Planned', 'Executed', 'Market P&L']}
              rows={accountMonthData.map(m => [
                { value: m.label },
                { value: money(m.planned), color: 'var(--text-secondary)' },
                { value: m.executed !== null ? money(m.executed) : '—', bold: m.executed !== null },
                {
                  value: m.marketPnL !== null ? `${m.marketPnL >= 0 ? '+' : ''}${money(m.marketPnL)}` : '—',
                  color: m.marketPnL !== null ? (m.marketPnL >= 0 ? 'var(--accent)' : 'var(--text-secondary)') : 'var(--text-muted)',
                },
              ])}
            />
          )}
        </Card>
      </div>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [tab, setTab] = useState<'overview' | 'plan' | 'monthly' | 'equity'>('overview')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>

      {/* Header */}
      <div className="page-header" style={{
        padding: '20px 32px 0',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Dashboard
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            KPIs, charts, and monthly summary · 2026
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0' }}>
          <TabBtn label="Overview" active={tab === 'overview'} onClick={() => setTab('overview')} />
          <TabBtn label="Plan vs Executed" active={tab === 'plan'} onClick={() => setTab('plan')} />
          <TabBtn label="Monthly Detail" active={tab === 'monthly'} onClick={() => setTab('monthly')} />
          <TabBtn label="Equity" active={tab === 'equity'} onClick={() => setTab('equity')} />
        </div>
      </div>

      {/* Content */}
      <div className="page-body" style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {tab === 'overview' && <OverviewTab />}
        {tab === 'plan' && <PlanTab />}
        {tab === 'monthly' && <MonthlyDetailTab />}
        {tab === 'equity' && <EquityTab />}
      </div>
    </div>
  )
}
