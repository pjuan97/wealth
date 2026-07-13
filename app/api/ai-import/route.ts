import { NextRequest, NextResponse } from 'next/server'

// Account import config (from AccountDef via /api/ai-import/accounts)
interface AccountImportConfig {
  name: string
  type: string
  statement_currency: string  // 'COP' | 'USD'
  sign_logic: string          // 'bank' | 'credit_card'
  default_counterparty: string | null
  context_notes: string | null
}

// Detect provider from API key format
function detectProvider(apiKey: string): 'anthropic' | 'gemini' | 'openai' {
  if (apiKey.startsWith('sk-ant-')) return 'anthropic'
  if (apiKey.startsWith('AIza') || apiKey.startsWith('AQ.') || apiKey.startsWith('ya29')) return 'gemini'
  if (apiKey.startsWith('sk-')) return 'openai'
  return 'gemini' // default to gemini for unknown formats
}

// Global merchant categorization rules (apply to ALL accounts)
const GLOBAL_MERCHANT_RULES = `
MERCHANT CATEGORIZATION (apply regardless of account):
- UBER/DL*UberRides/BUS/METRO/transportation → event_type: Expense, level_2: Life, level_3: Transportation
- UBER *EATS/RAPPI/food delivery → event_type: Expense, level_2: Life, level_3: Food Outside
- SUPER 99/FRUTAS/ZONA SUL/JUMBO/supermarket names → event_type: Expense, level_2: Life, level_3: Food Market
- AIRBNB/host payment → event_type: Expense, level_2: Life, level_3: Host Rent
- APPLE.COM/SPOTIFY/streaming → event_type: Expense, level_2: Others, level_3: Streaming Platforms
- AMAZON/cloud services → event_type: Expense, level_2: Others, level_3: Cloud Store
- LINKEDIN/CHATGPT/AI tools → event_type: Expense, level_2: Others, level_3: AI (LLM) -ChatGPT
- INTERESES CORRIENTES/COMISION → event_type: Expense, level_2: Others, level_3: Other
- ABONO INTERESES AHORROS/interest credit → event_type: Income, level_2: Other Incomes
`

// Bank-specific patterns (only for sign_logic='bank')
const BANK_PATTERNS = `
BANK-SPECIFIC PATTERNS (this is a bank account statement):
- "ABONO INTERESES AHORROS" → Income, level_2: Other Incomes, to_account: {DEFAULT_ACCOUNT}
- "TRASLADO DE FONDO" / "FIDUCUENTA" / "FONDO DE INVERS" → Transfer (between own accounts)
- "PAGO SUC VIRT TC" / "PAGO AUTOM TC" / "ABONO TC" → Debt_Payment, to_account: Credit Cards, from_account: {DEFAULT_ACCOUNT}
- "PAGO PSE" followed by company name → Expense, from_account: {DEFAULT_ACCOUNT}
- "TRANSFERENCIA A" person name → Expense, level_2: Others, level_3: Family/Friends
- "NEQUI" → Expense, level_2: Life, level_3: Transportation
- Negative values = money OUT (Expense/Transfer/Debt_Payment), from_account: {DEFAULT_ACCOUNT}
- Positive values = money IN (Income/Transfer), to_account: {DEFAULT_ACCOUNT}
`

// Credit card-specific patterns (only for sign_logic='credit_card')
const CREDIT_CARD_PATTERNS = `
CREDIT CARD-SPECIFIC PATTERNS (this is a credit card statement):
- Values WITHOUT minus sign = EXPENSES (merchant charge = debt increases)
  → event_type: Expense, from_account: {DEFAULT_ACCOUNT}, to_account: null
- Values WITH minus sign "-" = debt DECREASES. Two subcases:
  A) Bank payment ("ABONO SUCURSAL", "ABONO SUC VIRT", "PAGO SUC VIRT"):
     → SKIP completely — already recorded in bank cash extract
  B) Merchant REFUND (any other negative, e.g. "DELTA", "REVERSION", "DEVOLUCION"):
     → event_type: Transfer, from_account: null, to_account: {DEFAULT_ACCOUNT}
     → amount: absolute value (ignore the minus sign)
     → level_1: "Financial Movement", level_2: "Financial Movement"
EXAMPLE: "DELTA USD -$ 672,43" → Transfer, to_account: {DEFAULT_ACCOUNT}, usd_amount: 672.43
`

// System prompt for transaction extraction
function buildSystemPrompt(config: AccountImportConfig): string {
  const defaultAccount = config.default_counterparty || config.name

  // Number format rules (global)
  const numberFormatRules = `
NUMBER FORMAT — CRITICAL:
Statement uses Colombian/Spanish number format:
- Period "." = thousands separator (REMOVE IT)
- Comma "," = decimal separator (REPLACE with period)
EXAMPLES:
- "$ 935.743,74" → amount: 935743.74
- "$ 3.720.000,00" → amount: 3720000.00
- "USD $ 13,80" → usd_amount: 13.80
- "USD -$ 672,43" → usd_amount: 672.43 (negative = special handling per rules below)
STEP BY STEP: Remove currency symbol → Remove ALL periods → Replace comma with period → Parse as float
NEVER truncate. "935.743,74" → 935743.74 NOT 935.74
`

  // Account-specific rules based on sign_logic
  const accountRules = config.sign_logic === 'bank'
    ? BANK_PATTERNS.replace(/{DEFAULT_ACCOUNT}/g, defaultAccount)
    : CREDIT_CARD_PATTERNS.replace(/{DEFAULT_ACCOUNT}/g, defaultAccount)

  // Currency rules
  const currencyRules = config.statement_currency === 'USD'
    ? `CURRENCY: This statement is in USD. Set usd_amount field for all values. Leave amount null (system calculates COP from TRM).`
    : `CURRENCY: This statement is in COP. Set amount field for all values. Leave usd_amount null unless explicitly shown.`

  // Context notes (only if present)
  const contextSection = config.context_notes
    ? `\nACCOUNT-SPECIFIC CONTEXT:\n${config.context_notes}\n`
    : ''

  // Output format
  const outputFormat = `
OUTPUT FORMAT — CRITICAL:
Return ONLY a valid JSON array. Start with [ directly. No markdown, no explanation.

Each transaction object:
{
  "date": "YYYY-MM-DD",
  "event_type": "Income|Expense|Transfer|Investment|Withdrawal|Debt_Payment|Debt_Increase|Opening_Balance",
  "level_1": "Income|Expense|Financial Movement|Equity|Debt",
  "level_2": "category name",
  "level_3": "subcategory or null",
  "amount": null or number (COP),
  "usd_amount": null or number (USD),
  "from_account": "${defaultAccount} or other account name or null",
  "to_account": "${defaultAccount} or other account name or null",
  "notes": "merchant/description from statement"
}

CATEGORY MAPPING (level_2 → level_3):
Life: Food Market, Food Outside, Host Rent, Public Services, Transportation, Personal Articles
Health: Social Security, Medicine, Health Complementary Plan, Gym, Protein, Hair Treatment, Psychology, Skin Treatment, Dental Treatment
Travels: Other countries, Within Countries, Other Tickets
Others: Cloud Store, AI (LLM) -ChatGPT, Study, Celullar Data, Spotify, Family/Friends, Clothes, Technology, Events, Streaming Platforms, Dani, Other
Income: Salary, Other Incomes
Equity: Bank (Cash), Fiduciary, ETFs, Collective Investment Funds, Companies
Debt: Credit Cards, Loans
Financial Movement: Financial Movement

KNOWN ACCOUNTS (use exact names only):
- Cash: Bancolombia (Cash), Dollar App (Cash)
- Investment: Bancolombia Fiduciary, Trii, Tyba, Dollar App (ETFs), Interactive Brokers
- Debt: Credit Cards, Loans
`

  return `You are a financial transaction extractor. Extract ALL transactions from the bank statement images provided.

ACCOUNT BEING PROCESSED: ${config.name} (${config.type})
DEFAULT ACCOUNT FOR TRANSACTIONS: ${defaultAccount}

${currencyRules}

${accountRules}

${GLOBAL_MERCHANT_RULES}

${numberFormatRules}
${contextSection}
${outputFormat}

Extract every transaction visible. Do not skip any row.`
}

// Call Anthropic API
async function callAnthropic(apiKey: string, images: string[], config: AccountImportConfig, feedback: string | null) {
  const content: object[] = images.map(img => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: img.startsWith('/9j/') ? 'image/jpeg' : 'image/png',
      data: img,
    },
  }))
  const userText = 'Extract all transactions from these bank statement images. Your response must be ONLY a valid JSON array starting with [ and ending with ]. No explanation, no markdown, no code blocks. Start your response with [ directly.'
    + (feedback ? `\n\nUSER FEEDBACK FROM PREVIOUS EXTRACTION:\n${feedback}\nPlease correct the extraction based on this feedback.` : '')
  content.push({ type: 'text', text: userText })

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      system: buildSystemPrompt(config),
      messages: [{ role: 'user', content }],
    }),
  })

  if (response.status === 401) throw new Error('INVALID_API_KEY')
  if (response.status === 429) throw new Error('RATE_LIMIT_EXCEEDED')
  if (response.status === 402) throw new Error('INSUFFICIENT_CREDITS')
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `API error ${response.status}`)
  }

  const data = await response.json()

  // Detect truncation
  if (data.stop_reason === 'max_tokens') {
    console.error('Response truncated at max_tokens — extracto demasiado largo')
    throw new Error('RESPONSE_TRUNCATED')
  }

  if (!data.content?.[0]) {
    console.error('No content in response:', JSON.stringify(data).substring(0, 500))
    throw new Error('Empty response from Anthropic')
  }

  const text = data.content[0].text
  return text
}

// Call Google Gemini API
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
]

async function callGemini(apiKey: string, images: string[], config: AccountImportConfig, feedback: string | null) {
  const parts: object[] = images.map(img => ({
    inline_data: {
      mime_type: img.startsWith('/9j/') ? 'image/jpeg' : 'image/png',
      data: img,
    },
  }))
  const promptText = buildSystemPrompt(config)
    + '\n\nExtract all transactions from these images.'
    + (feedback ? `\n\nUSER FEEDBACK FROM PREVIOUS EXTRACTION:\n${feedback}\nPlease correct the extraction based on this feedback.` : '')
  parts.push({ text: promptText })

  let lastError: Error | null = null
  for (const model of GEMINI_MODELS) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
      }
    )

    if (response.status === 401 || response.status === 403) throw new Error('INVALID_API_KEY')
    if (response.status === 429) throw new Error('RATE_LIMIT_EXCEEDED')
    if (response.status === 404) {
      // Model not available, try next
      lastError = new Error(`Model ${model} not available`)
      continue
    }
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      lastError = new Error(err.error?.message || `API error ${response.status}`)
      continue
    }

    const data = await response.json()
    return data.candidates[0].content.parts[0].text
  }

  throw lastError || new Error('All Gemini models failed')
}

// Call OpenAI-compatible API
async function callOpenAI(apiKey: string, images: string[], config: AccountImportConfig, feedback: string | null) {
  const promptText = buildSystemPrompt(config)
    + '\n\nExtract all transactions from these images.'
    + (feedback ? `\n\nUSER FEEDBACK FROM PREVIOUS EXTRACTION:\n${feedback}\nPlease correct the extraction based on this feedback.` : '')
  const content: object[] = [
    { type: 'text', text: promptText },
    ...images.map(img => ({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${img}` },
    })),
  ]

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    }),
  })

  if (response.status === 401) throw new Error('INVALID_API_KEY')
  if (response.status === 429) throw new Error('RATE_LIMIT_EXCEEDED')
  if (response.status === 402 || response.status === 403) throw new Error('INSUFFICIENT_CREDITS')
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `API error ${response.status}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

// Parse LLM response to transactions array
function parseTransactions(text: string): object[] {
  // Strip markdown code blocks
  let cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim()

  // Try to find JSON array directly
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0])
    } catch (e) {
      // Array found but invalid JSON — try to fix common issues
      console.error('JSON parse error on array match:', e)
    }
  }

  // Try parsing the entire cleaned text
  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed
    // If it's an object with a transactions key
    if (parsed.transactions) return parsed.transactions
  } catch (e) {
    console.error('JSON parse error on full text:', e)
  }

  // Last resort: find anything that looks like an array of objects
  const matches = cleaned.match(/\[\s*\{[\s\S]*?\}\s*\]/g)
  if (matches && matches.length > 0) {
    for (const match of matches) {
      try {
        const parsed = JSON.parse(match)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      } catch { continue }
    }
  }

  console.error('Full response text:', text.substring(0, 500))
  throw new Error('No JSON array found in response')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { apiKey, images, accountConfig, feedback } = body
    // images: string[] (base64), accountConfig: AccountImportConfig

    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 400 })
    if (!images?.length) return NextResponse.json({ error: 'No images provided' }, { status: 400 })
    if (!accountConfig) return NextResponse.json({ error: 'No account config provided' }, { status: 400 })

    const provider = detectProvider(apiKey)
    const config: AccountImportConfig = accountConfig

    try {
      let text: string
      if (provider === 'anthropic') {
        text = await callAnthropic(apiKey, images, config, feedback || null)
      } else if (provider === 'gemini') {
        text = await callGemini(apiKey, images, config, feedback || null)
      } else {
        text = await callOpenAI(apiKey, images, config, feedback || null)
      }

      const transactions = parseTransactions(text)

      return NextResponse.json({
        transactions,
        provider,
        count: transactions.length,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      if (['INVALID_API_KEY', 'RATE_LIMIT_EXCEEDED', 'INSUFFICIENT_CREDITS', 'RESPONSE_TRUNCATED'].includes(msg)) {
        return NextResponse.json({
          error: msg,
          errorMessage: msg === 'RESPONSE_TRUNCATED'
            ? 'El extracto tiene demasiadas transacciones. Intenta subir menos páginas a la vez (máx 2-3 páginas por batch).'
            : msg === 'INVALID_API_KEY'
            ? 'Invalid API key. Please check and try again.'
            : msg === 'RATE_LIMIT_EXCEEDED'
            ? 'Rate limit exceeded. Please wait a moment and try again.'
            : 'Insufficient credits. Please add credits to your account or use a different API key.',
        }, { status: 402 })
      }
      throw err
    }
  } catch (error) {
    console.error('AI Import error:', error)
    return NextResponse.json({
      error: 'EXTRACTION_FAILED',
      errorMessage: error instanceof Error ? error.message : 'Failed to extract transactions',
    }, { status: 500 })
  }
}
