'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type Currency = 'COP' | 'USD'

interface CurrencyPreferenceValue {
  displayCurrency: Currency
  setDisplayCurrency: (c: Currency) => void
  monthlyFx: Record<string, number>
  avgFxRate: number
  // Convert a native amount into the currently chosen display currency, using
  // that month's own average TRM (falls back to the overall average when the
  // month has no rate data yet, e.g. a future month).
  convert: (value: number, nativeCurrency: Currency, month?: string) => number
  // Inverse of convert() — takes a value already expressed in the display
  // currency (e.g. what a user just typed into an edit field) and converts
  // it back into the row's native currency for storage.
  convertToNative: (displayValue: number, nativeCurrency: Currency, month?: string) => number
}

const CurrencyPreferenceContext = createContext<CurrencyPreferenceValue>({
  displayCurrency: 'COP',
  setDisplayCurrency: () => {},
  monthlyFx: {},
  avgFxRate: 3672,
  convert: value => value,
  convertToNative: value => value,
})

export function CurrencyPreferenceProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<number | null>(null)
  const [displayCurrency, setDisplayCurrencyState] = useState<Currency>('COP')
  const [monthlyFx, setMonthlyFx] = useState<Record<string, number>>({})
  const [avgFxRate, setAvgFxRate] = useState(3672)

  // Identify the logged-in user (the preference is scoped per-user, like the
  // AI Import draft, so it doesn't leak between accounts on a shared browser)
  // and load the monthly TRM map once.
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const uid = data?.user?.id
        if (uid == null) return
        setUserId(uid)
        const saved = localStorage.getItem(`wealth_display_currency_${uid}`)
        if (saved === 'COP' || saved === 'USD') setDisplayCurrencyState(saved)
      })
      .catch(() => {})

    fetch('/api/fx-rates?type=monthly-map')
      .then(r => r.json())
      .then(data => {
        setMonthlyFx(data.monthlyFx || {})
        setAvgFxRate(data.avgFxRate || 3672)
      })
      .catch(() => {})
  }, [])

  const setDisplayCurrency = useCallback((c: Currency) => {
    setDisplayCurrencyState(c)
    if (userId != null) localStorage.setItem(`wealth_display_currency_${userId}`, c)
  }, [userId])

  const convert = useCallback((value: number, nativeCurrency: Currency, month?: string) => {
    if (nativeCurrency === displayCurrency) return value
    const fx = (month && monthlyFx[month]) || avgFxRate
    return nativeCurrency === 'COP' ? value / fx : value * fx
  }, [displayCurrency, monthlyFx, avgFxRate])

  const convertToNative = useCallback((displayValue: number, nativeCurrency: Currency, month?: string) => {
    if (nativeCurrency === displayCurrency) return displayValue
    const fx = (month && monthlyFx[month]) || avgFxRate
    return nativeCurrency === 'COP' ? displayValue * fx : displayValue / fx
  }, [displayCurrency, monthlyFx, avgFxRate])

  return (
    <CurrencyPreferenceContext.Provider value={{ displayCurrency, setDisplayCurrency, monthlyFx, avgFxRate, convert, convertToNative }}>
      {children}
    </CurrencyPreferenceContext.Provider>
  )
}

export const useCurrencyPreference = () => useContext(CurrencyPreferenceContext)
