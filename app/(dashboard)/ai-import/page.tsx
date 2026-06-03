'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ImageBatch {
  id: string
  files: Array<{ name: string; base64: string; preview: string }>
  sourceType: 'cash' | 'credit_card'
}

interface ExtractedTransaction {
  id: string
  approved: boolean
  date: string
  event_type: string
  level_1: string
  level_2: string
  level_3: string | null
  usd_amount: number | null
  amount: number | null
  from_account: string | null
  to_account: string | null
  notes: string | null
  editing: boolean
}

type Step = 'upload' | 'apikey' | 'analyzing' | 'review' | 'done'

// ─── Constants ────────────────────────────────────────────────────────────────
const EVENT_TYPES = ['Income','Expense','Transfer','Investment','Withdrawal','Debt_Payment','Debt_Increase','Opening_Balance']
const LEVEL2_OPTIONS = [
  'Salary','Other Incomes','Life','Health','Travels','Others',
  'Financial Movement','Credit Cards','Loans','Fiduciary','ETFs',
  'Collective Investment Funds','Companies','Bank (Cash)',
]
const ACCOUNT_OPTIONS = [
  'Bancolombia (Cash)','Bancolombia Fiduciary','Credit Cards',
  'Trii','Tyba','Dollar App','Loans','Interactive Brokers',
]
const LEVEL3_BY_LEVEL2: Record<string, string[]> = {
  'Life': ['Food Market', 'Food Outside', 'Host Rent', 'Public Services', 'Transportation', 'Personal Articles'],
  'Health': ['Social Security', 'Medicine', 'Health Complementary Plan', 'Gym', 'Protein', 'Hair Treatment', 'Psychology', 'Skin Treatment', 'Dental Treatment'],
  'Travels': ['Other countries', 'Within Countries', 'Other Tickets'],
  'Others': ['Cloud Store', 'AI (LLM) -ChatGPT', 'Study', 'Celullar Data', 'Spotify', 'Family/Friends', 'Clothes', 'Technology', 'Events', 'Streaming Platforms', 'Dani', 'Other'],
  'Income': ['Salary', 'Other Incomes'],
  'Equity': ['Bank (Cash)', 'Fiduciary', 'ETFs', 'Collective Investment Funds', 'Companies', 'House'],
  'Debt': ['Credit Cards', 'Loans'],
  'Financial Movement': ['Financial Movement'],
}
const STORAGE_KEY = 'wealth_ai_import_draft'
const STORAGE_STEP_KEY = 'wealth_ai_import_step'

function formatCOP(n: number | null): string {
  if (!n) return '—'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

// ─── Token matching ───────────────────────────────────────────────────────
function extractTokens(notes: string): string[] {
  return notes
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3)
    .filter(t => !['the', 'and', 'del', 'de', 'la', 'los', 'las', 'com', 'www'].includes(t))
}

function sharedTokenCount(a: string, b: string): number {
  const tokensA = new Set(extractTokens(a))
  const tokensB = new Set(extractTokens(b))
  let count = 0
  tokensA.forEach(t => { if (tokensB.has(t)) count++ })
  return count
}

function areSimilar(notesA: string, notesB: string): boolean {
  const a = notesA.trim().toLowerCase()
  const b = notesB.trim().toLowerCase()
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  if (sharedTokenCount(a, b) >= 2) return true
  if (a.length >= 8 && b.length >= 8 && a.slice(0, 8) === b.slice(0, 8)) return true
  return false
}

// ─── Editable cell ────────────────────────────────────────────────────────────
function EditableCell({
  value, onChange, type = 'text', options,
}: {
  value: string | null
  onChange: (v: string) => void
  type?: 'text' | 'select' | 'date' | 'number'
  options?: string[]
}) {
  const [editing, setEditing] = useState(false)

  const style: React.CSSProperties = {
    background: 'transparent',
    border: editing ? '1px solid var(--accent-border)' : 'none',
    borderRadius: '4px',
    padding: '2px 4px',
    color: 'var(--text-primary)',
    fontSize: '12px',
    fontVariantNumeric: 'tabular-nums',
    cursor: 'text',
    outline: 'none',
    width: '100%',
    minWidth: '80px',
  }

  if (type === 'select' && options) {
    return (
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{ ...style, cursor: 'pointer', background: 'var(--bg-elevated)' }}
      >
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  return (
    <input
      type={type}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      style={style}
    />
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AIImportPage() {
  const [step, setStep] = useState<Step>('upload')
  const [batches, setBatches] = useState<ImageBatch[]>([])
  const [apiKey, setApiKey] = useState('')
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [transactions, setTransactions] = useState<ExtractedTransaction[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null)
  const [provider, setProvider] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null)
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)

  // ── localStorage draft persistence ─────────────────────────────────────────
  useEffect(() => {
    try {
      const savedStep = localStorage.getItem(STORAGE_STEP_KEY)
      const savedData = localStorage.getItem(STORAGE_KEY)
      if (savedData && savedStep === 'review') {
        const parsed = JSON.parse(savedData)
        if (parsed.transactions?.length > 0) {
          setTransactions(parsed.transactions)
          setFeedback(parsed.feedback || '')
          setProvider(parsed.provider || null)
          setDraftSavedAt(parsed.savedAt || null)
          setStep('review')
        }
      }
    } catch (e) {
      console.error('Failed to load draft:', e)
    }
  }, [])

  useEffect(() => {
    if (transactions.length > 0) {
      try {
        const savedAt = new Date().toISOString()
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          transactions,
          feedback,
          provider,
          savedAt,
        }))
        localStorage.setItem(STORAGE_STEP_KEY, 'review')
        setDraftSavedAt(savedAt)
      } catch (e) {
        console.error('Failed to save draft:', e)
      }
    }
  }, [transactions, feedback, provider])

  const clearDraft = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(STORAGE_STEP_KEY)
    } catch (e) {
      console.error('Failed to clear draft:', e)
    }
  }

  // ── File handling ──────────────────────────────────────────────────────────
  const addBatch = () => {
    const id = `batch_${Date.now()}`
    setBatches(prev => [...prev, { id, files: [], sourceType: 'cash' }])
  }

  const handleFiles = useCallback(async (batchId: string, files: FileList) => {
    const newFiles: ImageBatch['files'] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1]) // Remove data:image/xxx;base64, prefix
        }
        reader.readAsDataURL(file)
      })
      newFiles.push({
        name: file.name,
        base64,
        preview: URL.createObjectURL(file),
      })
    }
    setBatches(prev => prev.map(b =>
      b.id === batchId ? { ...b, files: [...b.files, ...newFiles] } : b
    ))
  }, [])

  const removeBatch = (batchId: string) => {
    setBatches(prev => prev.filter(b => b.id !== batchId))
  }

  const removeFile = (batchId: string, fileName: string) => {
    setBatches(prev => prev.map(b =>
      b.id === batchId ? { ...b, files: b.files.filter(f => f.name !== fileName) } : b
    ))
  }

  // ── Detect provider from key ───────────────────────────────────────────────
  const detectProvider = (key: string): string => {
    if (key.startsWith('sk-ant-')) return 'Anthropic Claude'
    if (key.startsWith('AIza') || key.startsWith('AQ.') || key.startsWith('ya29')) return 'Google Gemini'
    if (key.startsWith('sk-')) return 'OpenAI GPT-4o'
    return 'Google Gemini (default)'
  }

  // ── Run analysis ───────────────────────────────────────────────────────────
  const runAnalysis = async (withFeedback = false) => {
    setAnalyzing(true)
    setError(null)
    setStep('analyzing')

    try {
      const payload = {
        apiKey,
        feedback: withFeedback ? feedback : null,
        batches: batches.map(b => ({
          sourceType: b.sourceType,
          images: b.files.map(f => f.base64),
        })),
      }

      const res = await fetch('/api/ai-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.errorMessage || 'Analysis failed')
        setStep(withFeedback ? 'review' : 'apikey')
        return
      }

      setProvider(data.provider)

      // Transform to editable transactions
      const extracted: ExtractedTransaction[] = (data.transactions || []).map(
        (tx: Omit<ExtractedTransaction, 'id' | 'approved' | 'editing'>, i: number) => ({
          ...tx,
          id: `tx_${i}_${Date.now()}`,
          approved: true,
          editing: false,
        })
      )

      setTransactions(extracted)
      setStep('review')

      // Clear API key from memory after use
      setApiKey('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setStep(withFeedback ? 'review' : 'apikey')
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Update transaction ─────────────────────────────────────────────────────
  const updateTx = (id: string, field: keyof ExtractedTransaction, value: string | number | boolean | null) => {
    setTransactions(prev => prev.map(tx =>
      tx.id === id ? { ...tx, [field]: value } : tx
    ))
  }

  // ── Apply to similar ──────────────────────────────────────────────────────
  const [applyToast, setApplyToast] = useState<string | null>(null)

  const countSimilar = (tx: ExtractedTransaction): number => {
    if (!tx.notes) return 0
    return transactions.filter(t =>
      t.id !== tx.id &&
      t.notes &&
      areSimilar(tx.notes!, t.notes)
    ).length
  }

  const applyToSimilar = (sourceTx: ExtractedTransaction) => {
    if (!sourceTx.notes) return
    let count = 0

    setTransactions(prev => prev.map(tx => {
      if (tx.id === sourceTx.id) return tx
      if (!tx.notes) return tx
      if (areSimilar(sourceTx.notes!, tx.notes)) {
        count++
        return {
          ...tx,
          level_2: sourceTx.level_2,
          level_3: sourceTx.level_3,
          event_type: sourceTx.event_type,
        }
      }
      return tx
    }))

    setApplyToast(
      count > 0
        ? `Applied ${sourceTx.level_2} / ${sourceTx.level_3 || '\u2014'} to ${count} similar transaction${count !== 1 ? 's' : ''}`
        : `No similar transactions found for "${sourceTx.notes}"`
    )
    setTimeout(() => setApplyToast(null), 3000)
  }

  // ── Import approved ────────────────────────────────────────────────────────
  const handleImport = async () => {
    const approved = transactions.filter(t => t.approved)
    if (!approved.length) return

    try {
      const res = await fetch('/api/ai-import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: approved }),
      })
      const data = await res.json()
      setImportResult(data)
      clearDraft()
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const approvedCount = transactions.filter(t => t.approved).length

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-strong)',
    borderRadius: '8px',
    padding: '9px 12px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
  }

  const btnPrimary: React.CSSProperties = {
    padding: '9px 20px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    background: 'var(--accent)',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
  }

  const btnSecondary: React.CSSProperties = {
    padding: '9px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-strong)',
    cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => {
          if (e.target.files && activeBatchId) {
            handleFiles(activeBatchId, e.target.files)
          }
          e.target.value = ''
        }}
      />

      {/* Header */}
      <div style={{
        padding: '20px 32px 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
          AI Import
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Upload bank statement screenshots &rarr; AI extracts transactions &rarr; Review &amp; approve
        </p>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: '4px', marginTop: '16px' }}>
          {(['upload', 'apikey', 'analyzing', 'review', 'done'] as Step[]).map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{
                width: '24px', height: '24px',
                borderRadius: '50%',
                background: step === s ? 'var(--accent)' :
                  ['upload','apikey','analyzing','review','done'].indexOf(step) > i
                    ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                border: step === s ? 'none' : '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 700,
                color: step === s ? '#fff' : 'var(--text-muted)',
              }}>
                {i + 1}
              </div>
              <span style={{
                fontSize: '11px', fontWeight: step === s ? 600 : 400,
                color: step === s ? 'var(--text-primary)' : 'var(--text-muted)',
                textTransform: 'capitalize',
              }}>
                {s === 'apikey' ? 'API Key' : s === 'analyzing' ? 'Analyzing' : s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
              {i < 4 && <span style={{ color: 'var(--text-muted)', fontSize: '11px', margin: '0 4px' }}>&rarr;</span>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>

        {/* ── STEP 1: UPLOAD ──────────────────────────────────────────────── */}
        {step === 'upload' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px' }}>
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              padding: '20px 24px',
            }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                How it works
              </p>
              <ol style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8, paddingLeft: '20px', margin: 0 }}>
                <li>Add one or more image batches</li>
                <li>For each batch, select the source type (Bank Cash or Credit Card)</li>
                <li>Upload screenshots of your bank statements</li>
                <li>Enter your API key (Anthropic, Google Gemini, or OpenAI)</li>
                <li>Review extracted transactions and approve/edit</li>
              </ol>
            </div>

            {/* Batches */}
            {batches.map(batch => (
              <div key={batch.id} style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                overflow: 'hidden',
              }}>
                {/* Batch header */}
                <div style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {(['cash', 'credit_card'] as const).map(type => (
                      <button
                        key={type}
                        onClick={() => setBatches(prev => prev.map(b =>
                          b.id === batch.id ? { ...b, sourceType: type } : b
                        ))}
                        style={{
                          padding: '5px 14px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: batch.sourceType === type ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                          background: batch.sourceType === type ? 'var(--accent-subtle)' : 'transparent',
                          color: batch.sourceType === type ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                      >
                        {type === 'cash' ? 'Bank Cash' : 'Credit Card'}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {batch.files.length} image{batch.files.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => removeBatch(batch.id)}
                    style={{
                      marginLeft: 'auto',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(batch.id) }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => {
                    e.preventDefault()
                    setDragOver(null)
                    if (e.dataTransfer.files.length) handleFiles(batch.id, e.dataTransfer.files)
                  }}
                  onClick={() => {
                    setActiveBatchId(batch.id)
                    fileInputRef.current?.click()
                  }}
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: dragOver === batch.id ? 'var(--accent-subtle)' : 'transparent',
                    border: dragOver === batch.id ? '2px dashed var(--accent)' : '2px dashed transparent',
                    margin: '8px',
                    borderRadius: '8px',
                    transition: 'all 0.15s',
                  }}
                >
                  {batch.files.length === 0 ? (
                    <>
                      <p style={{ fontSize: '24px', marginBottom: '8px' }}>&#128248;</p>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        Click or drag images here
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        PNG, JPG, WEBP supported &middot; Multiple files OK
                      </p>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
                      {batch.files.map(file => (
                        <div key={file.name} style={{ position: 'relative' }}>
                          <img
                            src={file.preview}
                            alt={file.name}
                            style={{
                              width: '80px', height: '80px',
                              objectFit: 'cover',
                              borderRadius: '6px',
                              border: '1px solid var(--border)',
                            }}
                          />
                          <button
                            onClick={e => { e.stopPropagation(); removeFile(batch.id, file.name) }}
                            style={{
                              position: 'absolute', top: '-6px', right: '-6px',
                              width: '18px', height: '18px',
                              borderRadius: '50%',
                              background: 'var(--bg-elevated)',
                              border: '1px solid var(--border-strong)',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              fontSize: '10px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >&times;</button>
                          <p style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {file.name}
                          </p>
                        </div>
                      ))}
                      <div style={{
                        width: '80px', height: '80px',
                        borderRadius: '6px',
                        border: '2px dashed var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '24px', color: 'var(--text-muted)',
                      }}>+</div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Add batch + Continue */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={addBatch} style={btnSecondary}>
                + Add Image Batch
              </button>
              {batches.length > 0 && batches.some(b => b.files.length > 0) && (
                <button onClick={() => setStep('apikey')} style={btnPrimary}>
                  Continue &rarr;
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: API KEY ──────────────────────────────────────────────── */}
        {step === 'apikey' && (
          <div style={{ maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              padding: '24px',
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                Enter your API Key
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                {feedback
                  ? 'New API key required for re-analysis. Previous key was already discarded.'
                  : 'Your key is used only for this analysis and immediately discarded after use. Never stored.'}
              </p>

              {feedback && (
                <div style={{
                  padding: '10px 14px',
                  background: 'var(--accent-subtle)',
                  border: '1px solid var(--accent-border)',
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Re-analysis with feedback
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-primary)' }}>&ldquo;{feedback}&rdquo;</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Enter your API key to run a new analysis with this feedback applied.
                    The key will be discarded immediately after use.
                  </p>
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  API Key
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={apiKeyVisible ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-ant-... or AIza... or sk-..."
                    style={{ ...inputStyle, paddingRight: '40px' }}
                    autoFocus
                  />
                  <button
                    onClick={() => setApiKeyVisible(!apiKeyVisible)}
                    style={{
                      position: 'absolute', right: '10px', top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent', border: 'none',
                      cursor: 'pointer', fontSize: '14px', color: 'var(--text-muted)',
                    }}
                  >
                    {apiKeyVisible ? 'Hide' : 'Show'}
                  </button>
                </div>
                {apiKey && (
                  <p style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '6px' }}>
                    {detectProvider(apiKey)}
                  </p>
                )}
              </div>

              {error && (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(249,115,22,0.08)',
                  border: '1px solid var(--accent-border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--accent)',
                  marginBottom: '16px',
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setStep('upload')} style={btnSecondary}>
                  &larr; Back
                </button>
                <button
                  onClick={() => runAnalysis(!!feedback)}
                  disabled={!apiKey || analyzing}
                  style={{
                    ...btnPrimary,
                    background: apiKey ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: apiKey ? '#ffffff' : 'var(--text-muted)',
                    cursor: apiKey ? 'pointer' : 'not-allowed',
                  }}
                >
                  {analyzing ? 'Analyzing\u2026' : feedback ? 'Re-analyze with Feedback' : 'Run Analysis'}
                </button>
              </div>
            </div>

            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '14px 18px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
            }}>
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Supported providers:</p>
              <p><strong>Anthropic</strong> &mdash; Key starts with <code style={{ background: 'var(--bg-elevated)', padding: '1px 4px', borderRadius: '3px' }}>sk-ant-</code></p>
              <p><strong>Google Gemini</strong> &mdash; Key starts with <code style={{ background: 'var(--bg-elevated)', padding: '1px 4px', borderRadius: '3px' }}>AIza</code> (free tier available)</p>
              <p><strong>OpenAI</strong> &mdash; Key starts with <code style={{ background: 'var(--bg-elevated)', padding: '1px 4px', borderRadius: '3px' }}>sk-</code></p>
            </div>
          </div>
        )}

        {/* ── STEP 3: ANALYZING ────────────────────────────────────────────── */}
        {step === 'analyzing' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '20px' }}>
            <div style={{ fontSize: '48px', animation: 'spin 2s linear infinite' }}>&#9881;</div>
            <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Analyzing your statements&hellip;
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '400px' }}>
              The AI is reading your bank statements and extracting transactions.
              This may take 10&ndash;30 seconds depending on the number of images.
            </p>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ── STEP 4: REVIEW ───────────────────────────────────────────────── */}
        {step === 'review' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Review header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Review Extracted Transactions
                </p>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {approvedCount} of {transactions.length} selected for import
                  {provider && <span style={{ marginLeft: '8px', color: 'var(--accent)' }}>&middot; {provider}</span>}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setTransactions(prev => prev.map(t => ({ ...t, approved: true })))}
                  style={btnSecondary}
                >
                  Select All
                </button>
                <button
                  onClick={() => setTransactions(prev => prev.map(t => ({ ...t, approved: false })))}
                  style={btnSecondary}
                >
                  Deselect All
                </button>
                <button onClick={handleImport} disabled={approvedCount === 0} style={{
                  ...btnPrimary,
                  background: approvedCount > 0 ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: approvedCount > 0 ? '#ffffff' : 'var(--text-muted)',
                  cursor: approvedCount > 0 ? 'pointer' : 'not-allowed',
                }}>
                  Import {approvedCount} Transactions
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                padding: '10px 14px',
                background: 'rgba(249,115,22,0.08)',
                border: '1px solid var(--accent-border)',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'var(--accent)',
              }}>
                {error}
              </div>
            )}

            {/* Feedback + re-analyze */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '14px 18px',
            }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Feedback for re-analysis
              </p>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder='e.g. "TRASLADO DE FONDO transactions should be Transfer, not Income"'
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                />
                <button
                  onClick={() => setStep('apikey')}
                  style={btnSecondary}
                >
                  Re-analyze
                </button>
              </div>
            </div>

            {/* Draft saved banner */}
            {draftSavedAt && (
              <div style={{
                padding: '8px 14px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '11px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span>
                  Draft auto-saved &middot; Last saved: {new Date(draftSavedAt).toLocaleString()}
                </span>
                <button
                  onClick={() => {
                    clearDraft()
                    setBatches([])
                    setTransactions([])
                    setFeedback('')
                    setDraftSavedAt(null)
                    setStep('upload')
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    textDecoration: 'underline',
                  }}
                >
                  Discard draft
                </button>
              </div>
            )}

            {/* Transaction table */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              overflow: 'hidden',
              maxHeight: 'calc(100vh - 340px)',
              overflowY: 'auto',
              overflowX: 'auto',
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-base)' }}>
                      {['\u2713', 'Date', 'Type', 'Level 2', 'Level 3', 'Amount COP', 'USD', 'From', 'To', 'Notes'].map((h, i) => (
                        <th key={i} style={{
                          padding: '10px 10px',
                          fontSize: '10px',
                          fontWeight: 700,
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          textAlign: i === 0 ? 'center' : 'left',
                          borderBottom: '1px solid var(--border)',
                          whiteSpace: 'nowrap',
                          position: 'sticky',
                          top: 0,
                          background: 'var(--bg-base)',
                          zIndex: 5,
                        }}>{h}</th>
                      ))}
                      <th style={{
                        padding: '10px 10px',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        textAlign: 'center',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        position: 'sticky',
                        top: 0,
                        background: 'var(--bg-base)',
                        zIndex: 5,
                      }}>Apply</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => (
                      <tr
                        key={tx.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: tx.approved ? 'transparent' : 'rgba(71,85,105,0.15)',
                          opacity: tx.approved ? 1 : 0.5,
                        }}
                        onMouseEnter={e => { if (tx.approved) (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = tx.approved ? 'transparent' : 'rgba(71,85,105,0.15)' }}
                      >
                        {/* Checkbox */}
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={tx.approved}
                            onChange={e => updateTx(tx.id, 'approved', e.target.checked)}
                            style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                          />
                        </td>
                        {/* Date */}
                        <td style={{ padding: '6px 8px', minWidth: '110px' }}>
                          <EditableCell value={tx.date} type="date" onChange={v => updateTx(tx.id, 'date', v)} />
                        </td>
                        {/* Event Type */}
                        <td style={{ padding: '6px 8px', minWidth: '130px' }}>
                          <EditableCell value={tx.event_type} type="select" options={EVENT_TYPES} onChange={v => updateTx(tx.id, 'event_type', v)} />
                        </td>
                        {/* Level 2 */}
                        <td style={{ padding: '6px 8px', minWidth: '120px' }}>
                          <EditableCell value={tx.level_2} type="select" options={LEVEL2_OPTIONS} onChange={v => {
                            updateTx(tx.id, 'level_2', v)
                            const validOptions = LEVEL3_BY_LEVEL2[v] || []
                            if (!validOptions.includes(tx.level_3 || '')) {
                              updateTx(tx.id, 'level_3', null)
                            }
                          }} />
                        </td>
                        {/* Level 3 — dynamic dropdown based on level_2 */}
                        <td style={{ padding: '6px 8px', minWidth: '140px' }}>
                          {(() => {
                            const options = LEVEL3_BY_LEVEL2[tx.level_2] || []
                            if (options.length === 0) {
                              return (
                                <EditableCell
                                  value={tx.level_3}
                                  onChange={v => updateTx(tx.id, 'level_3', v || null)}
                                />
                              )
                            }
                            return (
                              <select
                                value={tx.level_3 || ''}
                                onChange={e => updateTx(tx.id, 'level_3', e.target.value || null)}
                                style={{
                                  background: 'var(--bg-elevated)',
                                  border: '1px solid var(--border)',
                                  borderRadius: '4px',
                                  padding: '3px 6px',
                                  color: 'var(--text-primary)',
                                  fontSize: '12px',
                                  outline: 'none',
                                  width: '100%',
                                  cursor: 'pointer',
                                }}
                              >
                                <option value="">&mdash;</option>
                                {options.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            )
                          })()}
                        </td>
                        {/* Amount COP */}
                        <td style={{ padding: '6px 8px', minWidth: '110px' }}>
                          <EditableCell
                            value={tx.amount ? String(tx.amount) : null}
                            type="number"
                            onChange={v => updateTx(tx.id, 'amount', v ? parseFloat(v) : null)}
                          />
                        </td>
                        {/* USD */}
                        <td style={{ padding: '6px 8px', minWidth: '80px' }}>
                          <EditableCell
                            value={tx.usd_amount ? String(tx.usd_amount) : null}
                            type="number"
                            onChange={v => updateTx(tx.id, 'usd_amount', v ? parseFloat(v) : null)}
                          />
                        </td>
                        {/* From */}
                        <td style={{ padding: '6px 8px', minWidth: '150px' }}>
                          <EditableCell value={tx.from_account} type="select" options={ACCOUNT_OPTIONS} onChange={v => updateTx(tx.id, 'from_account', v || null)} />
                        </td>
                        {/* To */}
                        <td style={{ padding: '6px 8px', minWidth: '150px' }}>
                          <EditableCell value={tx.to_account} type="select" options={ACCOUNT_OPTIONS} onChange={v => updateTx(tx.id, 'to_account', v || null)} />
                        </td>
                        {/* Notes */}
                        <td style={{ padding: '6px 8px', minWidth: '160px' }}>
                          <EditableCell value={tx.notes} onChange={v => updateTx(tx.id, 'notes', v || null)} />
                        </td>
                        {/* Apply to similar */}
                        <td style={{ padding: '6px 8px', textAlign: 'center', minWidth: '80px' }}>
                          {(() => {
                            const similar = countSimilar(tx)
                            if (similar === 0) return <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>&mdash;</span>
                            return (
                              <button
                                onClick={() => applyToSimilar(tx)}
                                title={`Apply ${tx.level_2} / ${tx.level_3 || '\u2014'} to ${similar} similar transaction${similar !== 1 ? 's' : ''}`}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  background: 'var(--accent-subtle)',
                                  border: '1px solid var(--accent-border)',
                                  color: 'var(--accent)',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                &darr; {similar}
                              </button>
                            )
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
          </div>
        )}

        {/* ── STEP 5: DONE ─────────────────────────────────────────────────── */}
        {step === 'done' && importResult && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            minHeight: '300px', gap: '20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '56px' }}>&#10004;</div>
            <p style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {importResult.imported} transactions imported
            </p>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              {importResult.errors.length > 0
                ? `${importResult.errors.length} errors — see details below`
                : 'All transactions imported successfully'}
            </p>

            {importResult.errors.length > 0 && (
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '14px 18px',
                maxWidth: '500px',
                width: '100%',
                textAlign: 'left',
              }}>
                {importResult.errors.map((e, i) => (
                  <p key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    {e}
                  </p>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  clearDraft()
                  setBatches([])
                  setTransactions([])
                  setFeedback('')
                  setError(null)
                  setImportResult(null)
                  setDraftSavedAt(null)
                  setStep('upload')
                }}
                style={btnSecondary}
              >
                Import More
              </button>
              <button
                onClick={() => window.location.href = '/transactions'}
                style={btnPrimary}
              >
                Go to Transactions &rarr;
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Apply toast */}
      {applyToast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--accent-border)',
          borderLeft: '3px solid var(--accent)',
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '13px',
          color: 'var(--text-primary)',
          zIndex: 999,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          animation: 'fadeIn 0.2s ease',
        }}>
          {applyToast}
        </div>
      )}
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  )
}
