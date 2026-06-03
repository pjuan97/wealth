import { NextRequest, NextResponse } from 'next/server'

// Detect provider from API key format
function detectProvider(apiKey: string): 'anthropic' | 'gemini' | 'openai' {
  if (apiKey.startsWith('sk-ant-')) return 'anthropic'
  if (apiKey.startsWith('AIza') || apiKey.startsWith('AQ.') || apiKey.startsWith('ya29')) return 'gemini'
  if (apiKey.startsWith('sk-')) return 'openai'
  return 'gemini' // default to gemini for unknown formats
}

// System prompt for transaction extraction
function buildSystemPrompt(sourceType: 'cash' | 'credit_card'): string {
  const cashRules = `
BANCOLOMBIA CASH ACCOUNT RULES:
- GREEN values (positive, no minus sign) = money ENTERING the account
  → event_type: Income OR Transfer (if it looks like a bank transfer between own accounts)
  → to_account: "Bancolombia (Cash)"
- RED values (negative, with minus sign "-") = money LEAVING the account
  → event_type: Expense OR Transfer OR Debt_Payment
  → from_account: "Bancolombia (Cash)"

Specific patterns:
- "ABONO INTERESES AHORROS" → Income, level_2: "Other Incomes", level_3: null
- "TRASLADO DE FONDO" / "FIDUCUENTA" / "FONDO DE INVERS" → Transfer, from_account or to_account accordingly
- "PAGO SUC VIRT TC" / "PAGO AUTOM TC" / "ABONO TC" → Debt_Payment, to_account: "Credit Cards"
- "TRANSFERENCIA A" person name → Expense, level_2: "Others", level_3: "Family/Friends"
- "PAGO PSE" → Expense (utility or service payment)
- "NEQUI" → Expense, level_2: "Life", level_3: "Transportation"
- Regular purchases → Expense with appropriate category
`

  const creditCardRules = `
CREDIT CARD RULES (OPPOSITE LOGIC):
- GREEN values / values WITHOUT minus sign = EXPENSES (increase debt)
  → event_type: Expense
  → from_account: "Credit Cards"
- RED values / values WITH minus sign "-" = payments or refunds (decrease debt)
  → If "ABONO SUCURSAL VIRTUAL" or payment → SKIP this transaction (already recorded in bank cash)
  → If refund/devolución → event_type: Expense with negative amount? No → skip or mark as Transfer

IMPORTANT for credit cards:
- SKIP any "ABONO" or payment transactions to avoid double counting
- USD amounts: extract usd_amount, the COP equivalent will be calculated via FX rate
- "DL *" or "DLO *" prefix = Didi/delivery app
- "UBER *" = Transportation
- "APPLE.COM" = Cloud Store
- Regular merchants = Expense with best-guess category

CURRENCY DETECTION:
- If value shows "USD $X.XX" → set usd_amount = X.XX, leave amount blank (system will calculate)
- If value shows "COP $X" or just "$X" → set amount = X, leave usd_amount blank
`

  return `You are a financial transaction extractor. Extract transactions from bank statement screenshots.

${sourceType === 'cash' ? cashRules : creditCardRules}

CATEGORY MAPPING (level_2 → level_3):
Life: Food Market, Food Outside, Host Rent, Public Services, Transportation, Personal Articles
Health: Social Security, Medicine, Health Complementary Plan, Gym, Protein, Hair Treatment, Psychology, Skin Treatment, Dental Treatment
Travels: Other countries, Within Countries, Other Tickets
Others: Cloud Store, AI (LLM) -ChatGPT, Study, Celullar Data, Spotify, Family/Friends, Clothes, Technology, Events, Streaming Platforms, Dani, Other
Income: Salary, Other Incomes
Equity: Bank (Cash), Fiduciary, ETFs, Collective Investment Funds, Companies
Debt: Credit Cards, Loans
Financial Movement: Financial Movement

VALID EVENT TYPES: Income, Expense, Transfer, Investment, Withdrawal, Debt_Payment, Debt_Increase, Opening_Balance

OUTPUT FORMAT — Respond ONLY with a valid JSON array, no markdown, no explanation:
[
  {
    "date": "YYYY-MM-DD",
    "event_type": "Expense",
    "level_1": "Expense",
    "level_2": "Life",
    "level_3": "Food Market",
    "usd_amount": null,
    "amount": 45000,
    "from_account": "Credit Cards",
    "to_account": null,
    "notes": "SUPERMARKET NAME"
  }
]

RULES:
- All amounts must be POSITIVE numbers (direction is determined by from/to account)
- Dates in YYYY-MM-DD format
- If you cannot determine the category, use level_2: "Others", level_3: "Other"
- If a transaction looks like a Transfer between own accounts, use event_type: "Transfer"
- Skip credit card payment transactions (ABONO SUCURSAL VIRTUAL) to avoid double counting
- Return ONLY the JSON array, nothing else`
}

// Call Anthropic API
async function callAnthropic(apiKey: string, images: string[], sourceType: 'cash' | 'credit_card', feedback: string | null) {
  const content: object[] = images.map(img => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: img.startsWith('/9j/') ? 'image/jpeg' : 'image/png',
      data: img,
    },
  }))
  const userText = 'Extract all transactions from these bank statement images. Return only a JSON array.'
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
      max_tokens: 4096,
      system: buildSystemPrompt(sourceType),
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
  return data.content[0].text
}

// Call Google Gemini API
async function callGemini(apiKey: string, images: string[], sourceType: 'cash' | 'credit_card', feedback: string | null) {
  const parts: object[] = images.map(img => ({
    inline_data: {
      mime_type: img.startsWith('/9j/') ? 'image/jpeg' : 'image/png',
      data: img,
    },
  }))
  const promptText = buildSystemPrompt(sourceType)
    + '\n\nExtract all transactions from these images.'
    + (feedback ? `\n\nUSER FEEDBACK FROM PREVIOUS EXTRACTION:\n${feedback}\nPlease correct the extraction based on this feedback.` : '')
  parts.push({ text: promptText })

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
    }
  )

  if (response.status === 400) throw new Error('INVALID_API_KEY')
  if (response.status === 429) throw new Error('RATE_LIMIT_EXCEEDED')
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `API error ${response.status}`)
  }

  const data = await response.json()
  return data.candidates[0].content.parts[0].text
}

// Call OpenAI-compatible API
async function callOpenAI(apiKey: string, images: string[], sourceType: 'cash' | 'credit_card', feedback: string | null) {
  const promptText = buildSystemPrompt(sourceType)
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
  // Strip markdown code blocks if present
  const cleaned = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()

  // Find JSON array
  const match = cleaned.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON array found in response')

  return JSON.parse(match[0])
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { apiKey, batches, feedback } = body
    // batches: Array<{ images: string[] (base64), sourceType: 'cash' | 'credit_card' }>

    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 400 })
    if (!batches?.length) return NextResponse.json({ error: 'No images provided' }, { status: 400 })

    const provider = detectProvider(apiKey)
    const allTransactions: object[] = []

    for (const batch of batches) {
      const { images, sourceType } = batch

      try {
        let text: string
        if (provider === 'anthropic') {
          text = await callAnthropic(apiKey, images, sourceType, feedback || null)
        } else if (provider === 'gemini') {
          text = await callGemini(apiKey, images, sourceType, feedback || null)
        } else {
          text = await callOpenAI(apiKey, images, sourceType, feedback || null)
        }

        const transactions = parseTransactions(text)
        allTransactions.push(...transactions)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        if (['INVALID_API_KEY', 'RATE_LIMIT_EXCEEDED', 'INSUFFICIENT_CREDITS'].includes(msg)) {
          return NextResponse.json({
            error: msg,
            errorMessage: msg === 'INVALID_API_KEY'
              ? 'Invalid API key. Please check and try again.'
              : msg === 'RATE_LIMIT_EXCEEDED'
              ? 'Rate limit exceeded. Please wait a moment and try again.'
              : 'Insufficient credits. Please add credits to your account or use a different API key.',
          }, { status: 402 })
        }
        throw err
      }
    }

    return NextResponse.json({
      transactions: allTransactions,
      provider,
      count: allTransactions.length,
    })
  } catch (error) {
    console.error('AI Import error:', error)
    return NextResponse.json({
      error: 'EXTRACTION_FAILED',
      errorMessage: error instanceof Error ? error.message : 'Failed to extract transactions',
    }, { status: 500 })
  }
}
