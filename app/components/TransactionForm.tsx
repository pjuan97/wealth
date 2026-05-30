'use client'

import { useState, useEffect } from 'react'
import { ACCOUNTS, EVENT_TYPES, LEVEL_2_BY_LEVEL_1, LEVEL_3_BY_LEVEL_2 } from '@/lib/constants'

interface FxRate {
  month_label: string
  rate_to_cop: number
}

interface TransactionFormProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  selectedMonth: string
}

const EVENT_TYPE_RULES: Record<string, { from: boolean; to: boolean }> = {
  Opening_Balance: { from: false, to: true },
  Income:          { from: false, to: true },
  Expense:         { from: true,  to: false },
  Transfer:        { from: true,  to: true },
  Investment:      { from: true,  to: true },
  Withdrawal:      { from: true,  to: true },
  Debt_Payment:    { from: true,  to: true },
}

export default function TransactionForm({ open, onClose, onSuccess, selectedMonth }: TransactionFormProps) {
  const [loading, setLoading] = useState(false)
  const [fxRates, setFxRates] = useState<FxRate[]>([])
  const [form, setForm] = useState({
    date: '',
    month_label: selectedMonth,
    event_type: 'Expense',
    level_1: 'Expense',
    level_2: 'Life',
    level_3: '',
    usd_amount: '',
    fx_rate: '',
    amount: '',
    from_account: 'Credit Cards',
    to_account: '',
    notes: '',
  })

  useEffect(() => {
    fetch('/api/fx-rates')
      .then(r => r.json())
      .then(setFxRates)
      .catch(console.error)
  }, [])

  useEffect(() => {
    setForm(f => ({ ...f, month_label: selectedMonth }))
  }, [selectedMonth])

  // Auto-compute amount from USD
  useEffect(() => {
    if (form.usd_amount && form.fx_rate) {
      const computed = (parseFloat(form.usd_amount) * parseFloat(form.fx_rate)).toFixed(0)
      setForm(f => ({ ...f, amount: computed }))
    }
  }, [form.usd_amount, form.fx_rate])

  // Auto-fill FX rate when month changes
  useEffect(() => {
    const rate = fxRates.find(r => r.month_label === form.month_label)
    if (rate) setForm(f => ({ ...f, fx_rate: String(rate.rate_to_cop) }))
  }, [form.month_label, fxRates])

  // Auto-set level_1 from event_type
  useEffect(() => {
    const map: Record<string, string> = {
      Opening_Balance: 'Income',
      Income: 'Income',
      Expense: 'Expense',
      Transfer: 'Financial Movement',
      Investment: 'Equity',
      Withdrawal: 'Financial Movement',
      Debt_Payment: 'Debt',
    }
    const l1 = map[form.event_type] || 'Expense'
    const l2options = LEVEL_2_BY_LEVEL_1[l1] || []
    const l2 = l2options[0] || ''
    const l3options = LEVEL_3_BY_LEVEL_2[l2] || []
    const l3 = l3options[0] || ''
    setForm(f => ({ ...f, level_1: l1, level_2: l2, level_3: l3 }))
  }, [form.event_type])

  // Reset level_3 when level_2 changes
  useEffect(() => {
    const l3options = LEVEL_3_BY_LEVEL_2[form.level_2] || []
    setForm(f => ({ ...f, level_3: l3options[0] || '' }))
  }, [form.level_2])

  const rules = EVENT_TYPE_RULES[form.event_type] || { from: true, to: false }

  const handleSubmit = async () => {
    if (!form.date || !form.amount) return
    setLoading(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Failed')
      onSuccess()
      onClose()
      setForm(f => ({ ...f, date: '', usd_amount: '', amount: '', notes: '' }))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[420px] bg-[#0a0a0a] border-l border-white/10 z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <h2 className="text-white font-semibold text-base">New Transaction</h2>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Date + Month */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-white/50 text-xs mb-1.5">Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              />
            </div>
            <div>
              <label className="block text-white/50 text-xs mb-1.5">Month</label>
              <input
                type="text"
                value={form.month_label}
                onChange={e => setForm(f => ({ ...f, month_label: e.target.value }))}
                placeholder="2026-01"
                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              />
            </div>
          </div>

          {/* Event Type */}
          <div>
            <label className="block text-white/50 text-xs mb-1.5">Event Type *</label>
            <select
              value={form.event_type}
              onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
            >
              {EVENT_TYPES.map(et => (
                <option key={et} value={et} className="bg-black">{et.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          {/* Level 1 + 2 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-white/50 text-xs mb-1.5">Level 1</label>
              <input
                type="text"
                value={form.level_1}
                readOnly
                className="w-full bg-white/[0.03] border border-white/10 rounded-md px-3 py-2 text-white/40 text-sm cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-white/50 text-xs mb-1.5">Level 2 *</label>
              <select
                value={form.level_2}
                onChange={e => setForm(f => ({ ...f, level_2: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              >
                {(LEVEL_2_BY_LEVEL_1[form.level_1] || []).map(l2 => (
                  <option key={l2} value={l2} className="bg-black">{l2}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Level 3 */}
          {(LEVEL_3_BY_LEVEL_2[form.level_2] || []).length > 0 && (
            <div>
              <label className="block text-white/50 text-xs mb-1.5">Level 3</label>
              <select
                value={form.level_3}
                onChange={e => setForm(f => ({ ...f, level_3: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              >
                <option value="" className="bg-black">&mdash; none &mdash;</option>
                {(LEVEL_3_BY_LEVEL_2[form.level_2] || []).map(l3 => (
                  <option key={l3} value={l3} className="bg-black">{l3}</option>
                ))}
              </select>
            </div>
          )}

          {/* USD Amount + FX Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-white/50 text-xs mb-1.5">USD Amount</label>
              <input
                type="number"
                step="0.01"
                value={form.usd_amount}
                onChange={e => setForm(f => ({ ...f, usd_amount: e.target.value }))}
                placeholder="0.00"
                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              />
            </div>
            <div>
              <label className="block text-white/50 text-xs mb-1.5">FX Rate</label>
              <input
                type="number"
                step="0.01"
                value={form.fx_rate}
                onChange={e => setForm(f => ({ ...f, fx_rate: e.target.value }))}
                placeholder="3770.26"
                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              />
            </div>
          </div>

          {/* Amount COP */}
          <div>
            <label className="block text-white/50 text-xs mb-1.5">Amount COP *</label>
            <input
              type="number"
              step="1"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0"
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
            />
          </div>

          {/* From / To accounts */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-white/50 text-xs mb-1.5">
                From Account {rules.from && <span className="text-white/30">*</span>}
              </label>
              <select
                value={form.from_account}
                onChange={e => setForm(f => ({ ...f, from_account: e.target.value }))}
                disabled={!rules.from}
                className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-white/30
                  ${rules.from
                    ? 'bg-white/5 border-white/10 text-white'
                    : 'bg-white/[0.03] border-white/5 text-white/20 cursor-not-allowed'
                  }`}
              >
                <option value="" className="bg-black">&mdash; none &mdash;</option>
                {ACCOUNTS.map(a => (
                  <option key={a} value={a} className="bg-black">{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-white/50 text-xs mb-1.5">
                To Account {rules.to && <span className="text-white/30">*</span>}
              </label>
              <select
                value={form.to_account}
                onChange={e => setForm(f => ({ ...f, to_account: e.target.value }))}
                disabled={!rules.to}
                className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-white/30
                  ${rules.to
                    ? 'bg-white/5 border-white/10 text-white'
                    : 'bg-white/[0.03] border-white/5 text-white/20 cursor-not-allowed'
                  }`}
              >
                <option value="" className="bg-black">&mdash; none &mdash;</option>
                {ACCOUNTS.map(a => (
                  <option key={a} value={a} className="bg-black">{a}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-white/50 text-xs mb-1.5">Notes</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional description"
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-white/10 text-white/50 text-sm font-medium rounded-md hover:text-white hover:border-white/20 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !form.date || !form.amount}
            className="flex-1 px-4 py-2.5 bg-white text-black text-sm font-semibold rounded-md hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}
