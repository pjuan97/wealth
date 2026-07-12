'use client'

import { useState, useEffect } from 'react'

interface ImportConfig {
  import_enabled: boolean
  statement_currency: string | null
  sign_logic: string | null
  default_counterparty: string | null
  context_notes: string | null
}

interface AccountDef {
  id: number
  name: string
  type: string
  is_active: boolean
  import_enabled: boolean
  statement_currency: string | null
  sign_logic: string | null
  default_counterparty: string | null
  context_notes: string | null
}

interface CategoryDef {
  id: number
  level_1: string
  level_2: string
  level_3: string | null
  is_active: boolean
}

interface EventTypeDef {
  id: number
  name: string
  is_active: boolean
}

interface UsageInfo {
  transactions: number
  equity_executed?: number
  equity_forecast?: number
  total: number
}

const ACCOUNT_TYPES = ['cash', 'investment', 'debt']
const LEVEL_1_OPTIONS = ['Income', 'Expense', 'Equity', 'Debt', 'Financial Movement']

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '10px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      background: color === 'orange' ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
      color: color === 'orange' ? 'var(--accent)' : 'var(--text-secondary)',
    }}>
      {label}
    </span>
  )
}

function PropagateModal({
  title,
  usage,
  onConfirm,
  onCancel,
}: {
  title: string
  usage: UsageInfo
  onConfirm: (propagate: boolean) => void
  onCancel: () => void
}) {
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
        width: '420px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
          {title}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Este nombre est\u00e1 en uso en:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
          {usage.transactions > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Transactions</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{usage.transactions}</span>
            </div>
          )}
          {(usage.equity_executed ?? 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Equity Executed</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{usage.equity_executed}</span>
            </div>
          )}
          {(usage.equity_forecast ?? 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Equity Forecast</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{usage.equity_forecast}</span>
            </div>
          )}
          <div style={{
            display: 'flex', justifyContent: 'space-between', fontSize: '13px',
            borderTop: '1px solid var(--border)', paddingTop: '6px', marginTop: '4px',
          }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Total registros</span>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{usage.total}</span>
          </div>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
          \u00bfQuieres actualizar todos los registros existentes con el nuevo nombre?
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
            background: 'transparent', border: '1px solid var(--border-strong)',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}>
            Cancelar
          </button>
          <button onClick={() => onConfirm(false)} style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
            color: 'var(--text-primary)', cursor: 'pointer',
          }}>
            Solo renombrar
          </button>
          <button onClick={() => onConfirm(true)} style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            background: 'var(--accent)', border: 'none',
            color: '#ffffff', cursor: 'pointer',
          }}>
            Renombrar + Propagate
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DataSourcePage() {
  const [tab, setTab] = useState<'accounts' | 'categories' | 'eventTypes'>('accounts')
  const [accounts, setAccounts] = useState<AccountDef[]>([])
  const [categories, setCategories] = useState<CategoryDef[]>([])
  const [eventTypes, setEventTypes] = useState<EventTypeDef[]>([])
  const [loading, setLoading] = useState(true)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [newAccount, setNewAccount] = useState({ name: '', type: 'cash', equity_type: '', start_month: '2026-01' })
  const [newCategory, setNewCategory] = useState({ level_1: 'Expense', level_2: '', level_3: '' })
  const [newEventType, setNewEventType] = useState('')

  const [propagateModal, setPropagateModal] = useState<{
    type: string
    id: number
    newName: string
    oldName: string
    usage: UsageInfo
  } | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [configAccount, setConfigAccount] = useState<AccountDef | null>(null)
  const [configForm, setConfigForm] = useState<ImportConfig>({
    import_enabled: false,
    statement_currency: 'COP',
    sign_logic: 'bank',
    default_counterparty: null,
    context_notes: null,
  })
  const [savingConfig, setSavingConfig] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/data-source')
      const data = await res.json()
      setAccounts(data.accounts || [])
      setCategories(data.categories || [])
      setEventTypes(data.eventTypes || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const checkUsageAndEdit = async (
    type: string,
    id: number,
    oldName: string,
    newName: string,
    extra?: { level_2?: string; level_3?: string | null }
  ) => {
    const param = type === 'category'
      ? `${extra?.level_2 || oldName}||${extra?.level_3 || ''}`
      : oldName

    const res = await fetch(`/api/data-source/usage?type=${type}&name=${encodeURIComponent(param)}`)
    const usage: UsageInfo = await res.json()

    if (usage.total > 0) {
      setPropagateModal({ type, id, newName, oldName, usage })
    } else {
      await doUpdate(type, id, newName, false, oldName)
    }
  }

  const doUpdate = async (
    type: string,
    id: number,
    newName: string,
    propagate: boolean,
    oldName: string,
  ) => {
    setSaving(true)
    try {
      const body = type === 'account'
        ? { type, id, data: { name: newName }, propagate, oldName, newName }
        : type === 'category'
        ? { type, id, data: { level_2: newName }, propagate, oldName: { level_2: oldName }, newName }
        : { type, id, data: { name: newName } }

      await fetch('/api/data-source', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setEditingId(null)
      setPropagateModal(null)
      await load()
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const handleDelete = async (type: string, id: number) => {
    const res = await fetch(`/api/data-source?type=${type}&id=${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Cannot delete')
      setTimeout(() => setError(null), 4000)
      return
    }
    await load()
  }

  const handleAdd = async () => {
    setSaving(true)
    try {
      if (tab === 'accounts') {
        await fetch('/api/data-source', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'account', data: newAccount }),
        })
        setNewAccount({ name: '', type: 'cash', equity_type: '', start_month: '2026-01' })
      } else if (tab === 'categories') {
        await fetch('/api/data-source', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'category',
            data: {
              level_1: newCategory.level_1,
              level_2: newCategory.level_2,
              level_3: newCategory.level_3 || null,
            },
          }),
        })
        setNewCategory({ level_1: 'Expense', level_2: '', level_3: '' })
      } else {
        await fetch('/api/data-source', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'eventType', data: { name: newEventType } }),
        })
        setNewEventType('')
      }
      setShowAdd(false)
      await load()
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-strong)',
    borderRadius: '6px',
    padding: '6px 10px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
  }

  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

  const thStyle: React.CSSProperties = {
    padding: '10px 16px',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    textAlign: 'left',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-base)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  }

  const tdStyle: React.CSSProperties = {
    padding: '11px 16px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    borderBottom: '1px solid var(--border)',
  }

  const TYPE_COLORS: Record<string, string> = {
    cash: 'orange',
    investment: 'orange',
    debt: 'default',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* Header */}
      <div style={{
        padding: '20px 32px 0',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: '16px',
        }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Data Source
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Accounts, categories, and event types
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            style={{
              padding: '8px 16px', borderRadius: '8px',
              fontSize: '13px', fontWeight: 600,
              background: 'var(--accent)', color: '#ffffff',
              border: 'none', cursor: 'pointer',
            }}
          >
            + Add
          </button>
        </div>

        <div style={{ display: 'flex', gap: 0 }}>
          {([
            { key: 'accounts' as const, label: 'Accounts' },
            { key: 'categories' as const, label: 'Categories' },
            { key: 'eventTypes' as const, label: 'Event Types' },
          ]).map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setShowAdd(false) }} style={{
              padding: '10px 20px', fontSize: '13px', fontWeight: 500,
              cursor: 'pointer', background: 'transparent', border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t.key ? 'var(--accent)' : 'var(--text-secondary)',
              marginBottom: '-1px',
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderLeft: '3px solid var(--accent)',
          borderRadius: '8px', padding: '12px 16px',
          fontSize: '13px', color: 'var(--text-primary)',
          zIndex: 999, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>
          {error}
        </div>
      )}

      {propagateModal && (
        <PropagateModal
          title={`Rename "${propagateModal.oldName}"`}
          usage={propagateModal.usage}
          onConfirm={(propagate) =>
            doUpdate(propagateModal.type, propagateModal.id, propagateModal.newName, propagate, propagateModal.oldName)
          }
          onCancel={() => setPropagateModal(null)}
        />
      )}

      {configAccount && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px',
        }}>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
            borderRadius: '16px', width: '480px', maxHeight: '85vh', overflowY: 'auto',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Import Configuration
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {configAccount.name} &middot; How AI Import should read this account&apos;s statements
              </p>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

              {/* Enable toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={configForm.import_enabled}
                  onChange={e => setConfigForm(p => ({ ...p, import_enabled: e.target.checked }))}
                  style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Enable AI Import for this account
                </span>
              </label>

              {configForm.import_enabled && (
                <>
                  {/* Statement currency */}
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                      Statement Currency
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {['COP', 'USD'].map(c => (
                        <button key={c} onClick={() => setConfigForm(p => ({ ...p, statement_currency: c }))} style={{
                          flex: 1, padding: '8px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                          background: configForm.statement_currency === c ? 'var(--accent)' : 'transparent',
                          color: configForm.statement_currency === c ? '#fff' : 'var(--text-secondary)',
                          border: configForm.statement_currency === c ? 'none' : '1px solid var(--border-strong)',
                          cursor: 'pointer',
                        }}>{c}</button>
                      ))}
                    </div>
                  </div>

                  {/* Sign logic */}
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                      Sign Logic
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[
                        { key: 'bank', label: 'Bank account', sub: 'Negative = money out (expense), Positive = money in (income)' },
                        { key: 'credit_card', label: 'Credit card', sub: 'Positive = charge (debt up), Negative = refund/payment (debt down)' },
                      ].map(opt => (
                        <div key={opt.key} onClick={() => setConfigForm(p => ({ ...p, sign_logic: opt.key }))} style={{
                          padding: '10px 14px', borderRadius: '8px', cursor: 'pointer',
                          border: configForm.sign_logic === opt.key ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                          background: configForm.sign_logic === opt.key ? 'var(--accent-subtle)' : 'transparent',
                        }}>
                          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</p>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{opt.sub}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Default counterparty */}
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                      Default Account (from/to)
                    </label>
                    <select
                      value={configForm.default_counterparty || ''}
                      onChange={e => setConfigForm(p => ({ ...p, default_counterparty: e.target.value || null }))}
                      style={{
                        width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                        borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
                      }}
                    >
                      <option value="">&mdash; none &mdash;</option>
                      {accounts.filter(a => a.is_active).map(a => (
                        <option key={a.id} value={a.name}>{a.name}</option>
                      ))}
                    </select>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Transactions from this statement will default to this account. The LLM can override for transfers.
                    </p>
                  </div>

                  {/* Context notes */}
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                      Context Notes (optional)
                    </label>
                    <textarea
                      value={configForm.context_notes || ''}
                      onChange={e => setConfigForm(p => ({ ...p, context_notes: e.target.value || null }))}
                      placeholder="e.g. Transfers to Bancolombia say 'PAGO PROV'. Pix payments go to third parties directly."
                      rows={3}
                      style={{
                        width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                        borderRadius: '8px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '12px',
                        outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
                      }}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfigAccount(null)} style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
                background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', cursor: 'pointer',
              }}>Cancel</button>
              <button
                onClick={async () => {
                  setSavingConfig(true)
                  await fetch('/api/data-source', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      type: 'account_import_config',
                      id: configAccount.id,
                      importConfig: configForm,
                    }),
                  })
                  setSavingConfig(false)
                  setConfigAccount(null)
                  await load()
                }}
                disabled={savingConfig}
                style={{
                  padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
                }}
              >{savingConfig ? 'Saving\u2026' : 'Save Config'}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {showAdd && (
          <div style={{
            padding: '16px 32px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            display: 'flex', gap: '12px', alignItems: 'flex-end',
          }}>
            {tab === 'accounts' && (
              <>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>NAME</label>
                  <input style={inputStyle} placeholder="e.g. JP Morgan" value={newAccount.name} onChange={e => setNewAccount(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>TYPE</label>
                  <select style={selectStyle} value={newAccount.type} onChange={e => setNewAccount(p => ({ ...p, type: e.target.value }))}>
                    {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {newAccount.type === 'investment' && (
                  <>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        EQUITY TYPE
                      </label>
                      <select
                        style={selectStyle}
                        value={newAccount.equity_type}
                        onChange={e => setNewAccount(p => ({ ...p, equity_type: e.target.value }))}
                      >
                        <option value="">— Select type —</option>
                        <option value="ETFs">ETFs</option>
                        <option value="Fiduciary">Fiduciary</option>
                        <option value="Collective Investment Funds">Collective Investment Funds</option>
                        <option value="Companies">Companies</option>
                        <option value="Savings">Savings</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        START MONTH
                      </label>
                      <select
                        style={selectStyle}
                        value={newAccount.start_month}
                        onChange={e => setNewAccount(p => ({ ...p, start_month: e.target.value }))}
                      >
                        {['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
                          '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12'].map(m => {
                          const labels: Record<string, string> = {
                            '2026-01':'January','2026-02':'February','2026-03':'March',
                            '2026-04':'April','2026-05':'May','2026-06':'June',
                            '2026-07':'July','2026-08':'August','2026-09':'September',
                            '2026-10':'October','2026-11':'November','2026-12':'December',
                          }
                          return <option key={m} value={m}>{labels[m]} 2026</option>
                        })}
                      </select>
                    </div>
                  </>
                )}
              </>
            )}
            {tab === 'categories' && (
              <>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>LEVEL 1</label>
                  <select style={selectStyle} value={newCategory.level_1} onChange={e => setNewCategory(p => ({ ...p, level_1: e.target.value }))}>
                    {LEVEL_1_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>LEVEL 2</label>
                  <input style={inputStyle} placeholder="e.g. Life" value={newCategory.level_2} onChange={e => setNewCategory(p => ({ ...p, level_2: e.target.value }))} />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>LEVEL 3 (optional)</label>
                  <input style={inputStyle} placeholder="e.g. Food Market" value={newCategory.level_3} onChange={e => setNewCategory(p => ({ ...p, level_3: e.target.value }))} />
                </div>
              </>
            )}
            {tab === 'eventTypes' && (
              <div style={{ flex: 2 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>NAME</label>
                <input style={inputStyle} placeholder="e.g. Debt_Increase" value={newEventType} onChange={e => setNewEventType(e.target.value)} />
              </div>
            )}
            <button onClick={handleAdd} disabled={saving} style={{
              padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              background: 'var(--accent)', color: '#ffffff', border: 'none', cursor: 'pointer', flexShrink: 0,
            }}>
              {saving ? 'Saving\u2026' : 'Save'}
            </button>
            <button onClick={() => setShowAdd(false)} style={{
              padding: '8px 14px', borderRadius: '8px', fontSize: '13px',
              background: 'transparent', border: '1px solid var(--border-strong)',
              color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
            }}>
              Cancel
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading\u2026</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>

            {tab === 'accounts' && (
              <>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, paddingLeft: '32px' }}>Name</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, textAlign: 'right', paddingRight: '32px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(acc => (
                    <tr key={acc.id}
                      style={{ opacity: acc.is_active ? 1 : 0.45 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <td style={{ ...tdStyle, paddingLeft: '32px' }}>
                        {editingId === acc.id ? (
                          <input
                            autoFocus
                            style={{ ...inputStyle, width: '220px' }}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={async e => {
                              if (e.key === 'Enter') await checkUsageAndEdit('account', acc.id, acc.name, editValue)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            onBlur={async () => {
                              if (editValue !== acc.name) await checkUsageAndEdit('account', acc.id, acc.name, editValue)
                              else setEditingId(null)
                            }}
                          />
                        ) : (
                          <span style={{ fontWeight: 500 }}>{acc.name}</span>
                        )}
                      </td>
                      <td style={tdStyle}><Badge label={acc.type} color={TYPE_COLORS[acc.type] || 'default'} /></td>
                      <td style={tdStyle}><Badge label={acc.is_active ? 'Active' : 'Inactive'} color={acc.is_active ? 'orange' : 'default'} /></td>
                      <td style={{ ...tdStyle, textAlign: 'right', paddingRight: '32px' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => {
                              setConfigAccount(acc)
                              setConfigForm({
                                import_enabled: acc.import_enabled ?? false,
                                statement_currency: acc.statement_currency ?? 'COP',
                                sign_logic: acc.sign_logic ?? 'bank',
                                default_counterparty: acc.default_counterparty ?? acc.name,
                                context_notes: acc.context_notes ?? null,
                              })
                            }}
                            style={{
                              padding: '4px 12px', borderRadius: '6px', fontSize: '12px',
                              background: acc.import_enabled ? 'var(--accent-subtle)' : 'transparent',
                              border: acc.import_enabled ? '1px solid var(--accent-border)' : '1px solid var(--border-strong)',
                              color: acc.import_enabled ? 'var(--accent)' : 'var(--text-muted)',
                              cursor: 'pointer',
                            }}
                          >
                            {acc.import_enabled ? 'Import \u2713' : 'Configure Import'}
                          </button>
                          <button onClick={() => { setEditingId(acc.id); setEditValue(acc.name) }} style={{
                            padding: '4px 12px', borderRadius: '6px', fontSize: '12px',
                            background: 'transparent', border: '1px solid var(--border-strong)',
                            color: 'var(--text-secondary)', cursor: 'pointer',
                          }}>Edit</button>
                          <button
                            onClick={async () => {
                              if (acc.is_active) {
                                const confirmed = window.confirm(
                                  `Deactivate "${acc.name}"? It will be hidden from all dropdowns and Equity module.`
                                )
                                if (!confirmed) return
                              }
                              const res = await fetch(`/api/data-source?type=account&id=${acc.id}`, {
                                method: 'DELETE',
                              })
                              const data = await res.json()
                              if (data.success) await load()
                            }}
                            style={{
                              padding: '4px 12px', borderRadius: '6px', fontSize: '12px',
                              background: acc.is_active ? 'transparent' : 'var(--accent-subtle)',
                              border: acc.is_active
                                ? '1px solid var(--border-strong)'
                                : '1px solid var(--accent-border)',
                              color: acc.is_active ? 'var(--text-muted)' : 'var(--accent)',
                              cursor: 'pointer',
                            }}
                          >
                            {acc.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}

            {tab === 'categories' && (
              <>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, paddingLeft: '32px' }}>Level 1</th>
                    <th style={thStyle}>Level 2</th>
                    <th style={thStyle}>Level 3</th>
                    <th style={{ ...thStyle, textAlign: 'right', paddingRight: '32px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(cat => (
                    <tr key={cat.id}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <td style={{ ...tdStyle, paddingLeft: '32px' }}>
                        <Badge label={cat.level_1} color={['Income', 'Equity'].includes(cat.level_1) ? 'orange' : 'default'} />
                      </td>
                      <td style={tdStyle}>
                        {editingId === cat.id ? (
                          <input
                            autoFocus
                            style={{ ...inputStyle, width: '180px' }}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={async e => {
                              if (e.key === 'Enter') await checkUsageAndEdit('category', cat.id, cat.level_2, editValue, { level_2: cat.level_2, level_3: cat.level_3 })
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            onBlur={async () => {
                              if (editValue !== cat.level_2) await checkUsageAndEdit('category', cat.id, cat.level_2, editValue, { level_2: cat.level_2, level_3: cat.level_3 })
                              else setEditingId(null)
                            }}
                          />
                        ) : (
                          <span style={{ fontWeight: 500 }}>{cat.level_2}</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                        {cat.level_3 || <span style={{ color: 'var(--text-muted)' }}>\u2014</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', paddingRight: '32px' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button onClick={() => { setEditingId(cat.id); setEditValue(cat.level_2) }} style={{
                            padding: '4px 12px', borderRadius: '6px', fontSize: '12px',
                            background: 'transparent', border: '1px solid var(--border-strong)',
                            color: 'var(--text-secondary)', cursor: 'pointer',
                          }}>Edit</button>
                          <button onClick={() => handleDelete('category', cat.id)} style={{
                            padding: '4px 12px', borderRadius: '6px', fontSize: '12px',
                            background: 'transparent', border: '1px solid var(--border-strong)',
                            color: 'var(--text-muted)', cursor: 'pointer',
                          }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}

            {tab === 'eventTypes' && (
              <>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, paddingLeft: '32px' }}>Name</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, textAlign: 'right', paddingRight: '32px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {eventTypes.map(et => (
                    <tr key={et.id}
                      style={{ opacity: et.is_active ? 1 : 0.45 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <td style={{ ...tdStyle, paddingLeft: '32px' }}>
                        {editingId === et.id ? (
                          <input
                            autoFocus
                            style={{ ...inputStyle, width: '220px' }}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={async e => {
                              if (e.key === 'Enter') {
                                await fetch('/api/data-source', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ type: 'eventType', id: et.id, data: { name: editValue } }),
                                })
                                setEditingId(null)
                                load()
                              }
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                          />
                        ) : (
                          <span style={{ fontWeight: 500, fontSize: '13px' }}>
                            {et.name.replace(/_/g, ' ')}
                          </span>
                        )}
                      </td>
                      <td style={tdStyle}><Badge label={et.is_active ? 'Active' : 'Inactive'} color={et.is_active ? 'orange' : 'default'} /></td>
                      <td style={{ ...tdStyle, textAlign: 'right', paddingRight: '32px' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button onClick={() => { setEditingId(et.id); setEditValue(et.name) }} style={{
                            padding: '4px 12px', borderRadius: '6px', fontSize: '12px',
                            background: 'transparent', border: '1px solid var(--border-strong)',
                            color: 'var(--text-secondary)', cursor: 'pointer',
                          }}>Edit</button>
                          <button
                            onClick={async () => {
                              const res = await fetch(`/api/data-source?type=eventType&id=${et.id}`, {
                                method: 'DELETE',
                              })
                              const data = await res.json()
                              if (data.success) await load()
                            }}
                            style={{
                              padding: '4px 12px', borderRadius: '6px', fontSize: '12px',
                              background: et.is_active ? 'transparent' : 'var(--accent-subtle)',
                              border: et.is_active
                                ? '1px solid var(--border-strong)'
                                : '1px solid var(--accent-border)',
                              color: et.is_active ? 'var(--text-muted)' : 'var(--accent)',
                              cursor: 'pointer',
                            }}
                          >
                            {et.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}

          </table>
        )}
      </div>
    </div>
  )
}
