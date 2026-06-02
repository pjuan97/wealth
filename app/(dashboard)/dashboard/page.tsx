'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────
interface MonthlySummary {
  month: string; label: string
  income: number; expense: number; balance: number; savingsRate: number
}
interface IncomeSource {
  month: string; label: string; salary: number; other: number
}
interface PlanVsExec {
  month: string; label: string
  incomePlan: number; incomeExec: number
  expensePlan: number; expenseExec: number
  incomeVariance: number | null; expenseVariance: number | null
}
interface ExpenseByL2 {
  month: string; label: string
  life: number; health: number; travels: number; others: number
}
interface MonthlyRow {
  event_type: string; level_2: string; level_3: string | null
  plan: number; executed: number; diff: number
  variance: number | null; achievement: number | null
}
interface ExpenseByCat {
  month: string; label: string
  life: number; health: number; travels: number; others: number
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
const CURRENT_MONTH = '2026-06'
const MONTHS = [
  '2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
  '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12',
]
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
function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{name: string; value: number; color: string}>; label?: string
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
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fM(p.value)}</span>
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
      <div style={{ padding: '16px 20px' }}>{children}</div>
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
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
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
function OverviewTab() {
  const [data, setData] = useState<{
    monthlySummary: MonthlySummary[]
    incomeBySource: IncomeSource[]
    expenseByCategory: ExpenseByCat[]
    ytd: { income: number; expense: number; balance: number; savingsRate: number; months: number }
    netWorth: number; cashBalance: number; totalEquity: number
  } | null>(null)

  useEffect(() => {
    fetch('/api/dashboard?section=overview').then(r => r.json()).then(setData)
  }, [])

  if (!data) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>

  const withData = data.monthlySummary.filter(m => m.income > 0 || m.expense > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
        <KpiCard label="Net Worth" value={fM(data.netWorth)} accent />
        <KpiCard label="YTD Income" value={fM(data.ytd.income)} sub={`${data.ytd.months} months`} />
        <KpiCard label="YTD Expense" value={fM(data.ytd.expense)} />
        <KpiCard label="YTD Balance" value={fM(data.ytd.balance)} />
        <KpiCard label="Savings Rate" value={fPct(data.ytd.savingsRate)} />
      </div>

      {/* Income vs Expense chart + table */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        <Card title="Income vs Expense vs Balance" subtitle="Monthly">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={withData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fM} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip />} />
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
              { value: fM(m.income) },
              { value: fM(m.expense), color: 'var(--text-secondary)' },
              { value: fM(m.balance), color: m.balance >= 0 ? 'var(--accent)' : 'var(--text-secondary)', bold: true },
              { value: fPct(m.savingsRate), color: m.savingsRate >= 0.2 ? 'var(--accent)' : 'var(--text-secondary)' },
            ])}
          />
        </Card>
      </div>

      {/* Income by source chart + table */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        <Card title="Income by Source" subtitle="Salary vs Other Incomes">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={withData.map(m => {
              const src = data.incomeBySource.find(s => s.month === m.month)
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
              <YAxis tickFormatter={fM} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip />} />
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
              const src = data.incomeBySource.find(s => s.month === m.month)
              return [
                { value: m.label },
                { value: fM(src?.salary || 0) },
                { value: fM(src?.other || 0), color: 'var(--text-secondary)' },
              ]
            })}
          />
        </Card>
      </div>

      {/* Expense by Category — line chart + table */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        <Card title="Expense by Category" subtitle="Life / Health / Travels / Others — monthly trend">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={withData.map(m => {
                const exp = data.expenseByCategory?.find((e: ExpenseByCat) => e.month === m.month)
                return {
                  label: m.label,
                  Life: exp?.life || 0,
                  Health: exp?.health || 0,
                  Travels: exp?.travels || 0,
                  Others: exp?.others || 0,
                }
              })}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fM} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line type="monotone" dataKey="Life" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: '#f97316' }} />
              <Line type="monotone" dataKey="Health" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3, fill: '#94a3b8' }} />
              <Line type="monotone" dataKey="Travels" stroke="#64748b" strokeWidth={2} dot={{ r: 3, fill: '#64748b' }} />
              <Line type="monotone" dataKey="Others" stroke="#cbd5e1" strokeWidth={2} dot={{ r: 3, fill: '#cbd5e1' }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Expense by Category YTD">
          <MiniTable
            headers={['Month', 'Life', 'Health', 'Travels', 'Others']}
            rows={withData.map(m => {
              const exp = data.expenseByCategory?.find((e: ExpenseByCat) => e.month === m.month)
              return [
                { value: m.label },
                { value: fM(exp?.life || 0), color: '#f97316' },
                { value: fM(exp?.health || 0), color: '#94a3b8' },
                { value: fM(exp?.travels || 0), color: '#64748b' },
                { value: fM(exp?.others || 0) },
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
  const [data, setData] = useState<{
    planVsExec: PlanVsExec[]
    expenseByL2: ExpenseByL2[]
  } | null>(null)

  useEffect(() => {
    fetch('/api/dashboard?section=plan').then(r => r.json()).then(setData)
  }, [])

  if (!data) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>

  const withData = data.planVsExec.filter(m => m.incomePlan > 0 || m.incomeExec > 0)
  const expWithData = data.expenseByL2.filter(m => m.life + m.health + m.travels + m.others > 0)

  // Expense pie YTD
  const expensePieYTD = [
    { name: 'Life', value: expWithData.reduce((s, m) => s + m.life, 0) },
    { name: 'Health', value: expWithData.reduce((s, m) => s + m.health, 0) },
    { name: 'Travels', value: expWithData.reduce((s, m) => s + m.travels, 0) },
    { name: 'Others', value: expWithData.reduce((s, m) => s + m.others, 0) },
  ].filter(e => e.value > 0)

  const totalExpenseYTD = expensePieYTD.reduce((s, e) => s + e.value, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Income Plan vs Executed */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
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
              <YAxis tickFormatter={fM} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip />} />
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
              { value: fM(m.incomePlan), color: 'var(--text-secondary)' },
              { value: fM(m.incomeExec) },
              { value: fPct(m.incomeVariance), color: varianceColor(m.incomeVariance, 'income') },
            ])}
          />
        </Card>
      </div>

      {/* Expense Plan vs Executed */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
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
              <YAxis tickFormatter={fM} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip />} />
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
              { value: fM(m.expensePlan), color: 'var(--text-secondary)' },
              { value: fM(m.expenseExec) },
              { value: fPct(m.expenseVariance), color: varianceColor(m.expenseVariance, 'expense') },
            ])}
          />
        </Card>
      </div>

      {/* Expense breakdown by category */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        <Card title="Expense by Category" subtitle="Life / Health / Travels / Others">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={expWithData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fM} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="life" name="Life" fill={CHART_COLORS[0]} radius={[2,2,0,0]} stackId="a" />
              <Bar dataKey="health" name="Health" fill={CHART_COLORS[1]} radius={[0,0,0,0]} stackId="a" />
              <Bar dataKey="travels" name="Travels" fill={CHART_COLORS[2]} stackId="a" />
              <Bar dataKey="others" name="Others" fill={CHART_COLORS[3]} radius={[2,2,0,0]} stackId="a" />
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
              <Tooltip formatter={(v) => fM(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
            {expensePieYTD.map((e, i) => (
              <div key={e.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: PIE_COLORS[i], fontWeight: 600 }}>● {e.name}</span>
                <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {fM(e.value)} ({totalExpenseYTD > 0 ? ((e.value / totalExpenseYTD) * 100).toFixed(0) : 0}%)
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
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH)
  const [data, setData] = useState<{
    rows: MonthlyRow[]
    kpis: { income: number; expense: number; balance: number; month: string }
    expensePie: Array<{ name: string; value: number }>
  } | null>(null)

  const loadMonth = useCallback(async (m: string) => {
    const res = await fetch(`/api/dashboard?section=monthly&month=${m}`)
    const d = await res.json()
    setData(d)
  }, [])

  useEffect(() => { loadMonth(selectedMonth) }, [selectedMonth, loadMonth])

  const expenseRows = data?.rows.filter(r => r.event_type === 'Expense') || []
  const totalExpense = data?.expensePie.reduce((s, e) => s + e.value, 0) || 0

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <KpiCard label="Income" value={fCOP(data.kpis.income)} />
            <KpiCard label="Expense" value={fCOP(data.kpis.expense)} />
            <KpiCard label="Balance" value={fCOP(data.kpis.balance)} accent={data.kpis.balance >= 0} />
          </div>

          {/* Expense drilldown — full width layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>

            {/* Table — full height, no internal scroll */}
            <Card title={`Expenses — ${MONTH_LABELS[selectedMonth]}`} subtitle="Plan vs Executed by subcategory">
              <MiniTable
                headers={['Category', 'Plan', 'Executed', 'Diff', 'Var%']}
                rows={expenseRows.map(r => [
                  { value: r.level_3 || r.level_2 },
                  { value: fM(r.plan), color: 'var(--text-secondary)' },
                  { value: fM(r.executed), bold: r.executed > 0 },
                  {
                    value: r.diff !== 0 ? `${r.diff >= 0 ? '+' : ''}${fM(r.diff)}` : '—',
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
                    tickFormatter={fM}
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
                  <Tooltip content={<ChartTooltip />} />
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

  const withData = data.portfolioByMonth.filter(m => m.planned > 0)
  const totalLatest = data.distributionPie.reduce((s, e) => s + e.value, 0)
  const selectedAccountData = data.byAccount.find(a => a.account === selectedAccount)
  const accountMonthData = selectedAccountData?.monthData.filter(m => m.planned > 0) || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Portfolio KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {data.byAccount.filter(a => a.latestExecuted !== null).map(a => (
          <KpiCard
            key={a.account}
            label={a.account}
            value={fM(a.latestExecuted!)}
            sub={a.equity_type}
            accent={a.account === selectedAccount}
          />
        ))}
      </div>

      {/* Portfolio evolution + distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        <Card title="Portfolio: Planned vs Executed" subtitle="All accounts combined">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={withData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fM} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={56} />
              <Tooltip content={<ChartTooltip />} />
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
                    data={data.distributionPie}
                    cx="50%" cy="50%"
                    innerRadius={40} outerRadius={65}
                    dataKey="value"
                  >
                    {data.distributionPie.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fM(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                {data.distributionPie.map((e, i) => (
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
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
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
              <YAxis tickFormatter={fM} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip />} />
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
                { value: fM(m.planned), color: 'var(--text-secondary)' },
                { value: m.executed !== null ? fM(m.executed) : '—', bold: m.executed !== null },
                {
                  value: m.marketPnL !== null ? `${m.marketPnL >= 0 ? '+' : ''}${fM(m.marketPnL)}` : '—',
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* Header */}
      <div style={{
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {tab === 'overview' && <OverviewTab />}
        {tab === 'plan' && <PlanTab />}
        {tab === 'monthly' && <MonthlyDetailTab />}
        {tab === 'equity' && <EquityTab />}
      </div>
    </div>
  )
}
