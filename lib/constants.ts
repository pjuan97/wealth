export const ACCOUNTS = [
  'Bancolombia (Cash)',
  'Bancolombia Fiduciary',
  'Credit Cards',
  'Trii',
  'Tyba',
  'Dollar App',
  'Loans',
  'Interactive Brokers',
] as const

export const ASSET_ACCOUNTS = [
  'Bancolombia (Cash)',
  'Bancolombia Fiduciary',
  'Trii',
  'Tyba',
  'Dollar App',
  'Interactive Brokers',
] as const

export const LIABILITY_ACCOUNTS = [
  'Credit Cards',
  'Loans',
] as const

export const EVENT_TYPES = [
  'Opening_Balance',
  'Income',
  'Expense',
  'Transfer',
  'Investment',
  'Withdrawal',
  'Debt_Payment',
] as const

export const LEVEL_1_OPTIONS = [
  'Income',
  'Expense',
  'Equity',
  'Debt',
  'Financial Movement',
] as const

export const LEVEL_2_BY_LEVEL_1: Record<string, string[]> = {
  Income: ['Salary', 'Other Incomes', 'Opening Balance'],
  Expense: ['Life', 'Health', 'Travels', 'Others'],
  Equity: ['Bank (Cash)', 'Fiduciary', 'ETFs', 'Collective Investment Funds', 'Companies', 'House'],
  Debt: ['Credit Cards', 'Loans'],
  'Financial Movement': [],
}

export const LEVEL_3_BY_LEVEL_2: Record<string, string[]> = {
  Life: ['Food Market', 'Food Outside', 'Host Rent', 'Public Services', 'Transportation', 'Personal Articles'],
  Health: ['Social Security', 'Medicine', 'Health Complementary Plan', 'Gym', 'Protein', 'Hair Treatment', 'Psychology', 'Skin Treatment', 'Dental Treatment'],
  Travels: ['Other countries', 'Within Countries', 'Other Tickets'],
  Others: ['Cloud Store', 'AI (LLM) -ChatGPT', 'Study', 'Celullar Data', 'Spotify', 'Family/Friends', 'Clothes', 'Technology', 'Events', 'Streaming Platforms', 'Dani', 'Other'],
}

export const EQUITY_TYPES = [
  'Fiduciary',
  'ETFs',
  'Collective Investment Funds',
  'Companies',
] as const

export const MONTH_LABELS = [
  '2026-01', '2026-02', '2026-03', '2026-04',
  '2026-05', '2026-06', '2026-07', '2026-08',
  '2026-09', '2026-10', '2026-11', '2026-12',
] as const
