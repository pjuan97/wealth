'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import ThemeToggle from './ThemeToggle'
import { useCurrencyPreference } from './CurrencyPreferenceProvider'
import { NAV_ITEMS, isNavItemActive } from './navItems'

const BAR_HEIGHT = 60

// Phone navigation: a fixed bottom tab bar with the four most-used sections,
// plus a "Más" sheet holding the rest (and the account/display controls that
// live in the sidebar footer on desktop).
export default function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [userName, setUserName] = useState('')
  const { displayCurrency, setDisplayCurrency } = useCurrencyPreference()

  const primary = NAV_ITEMS.filter(i => i.primary)
  const secondary = NAV_ITEMS.filter(i => !i.primary)
  const secondaryActive = secondary.some(i => isNavItemActive(i.href, pathname))

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => setUserName(data.user?.name || ''))
      .catch(() => {})
  }, [])

  // Close the sheet whenever navigation happens, so it never covers the page
  // the user just chose.
  useEffect(() => { setSheetOpen(false) }, [pathname])

  // Don't let the page scroll behind an open sheet.
  useEffect(() => {
    document.body.style.overflow = sheetOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sheetOpen])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    padding: '8px 2px',
    minWidth: 0,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'none',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    fontSize: '10px',
    fontWeight: active ? 700 : 500,
    fontFamily: 'inherit',
  })

  return (
    <>
      {/* ── Bottom tab bar ─────────────────────────────────────────────── */}
      <nav
        className="mobile-only"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: `calc(${BAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border)',
          alignItems: 'stretch',
          zIndex: 900,
        }}
      >
        {primary.map(item => {
          const active = isNavItemActive(item.href, pathname)
          return (
            <Link key={item.href} href={item.href} style={tabStyle(active)}>
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
              <span style={{
                maxWidth: '100%', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.label}
              </span>
            </Link>
          )
        })}

        <button
          onClick={() => setSheetOpen(true)}
          aria-label="Más secciones"
          style={tabStyle(secondaryActive || sheetOpen)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
          </svg>
          <span>Más</span>
        </button>
      </nav>

      {/* ── "Más" sheet ────────────────────────────────────────────────── */}
      {sheetOpen && (
        <div
          className="mobile-only"
          onClick={() => setSheetOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxHeight: '85dvh',
              overflowY: 'auto',
              background: 'var(--bg-surface)',
              borderTopLeftRadius: '18px',
              borderTopRightRadius: '18px',
              borderTop: '1px solid var(--border-strong)',
              paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
            }}
          >
            {/* Grab handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
              <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'var(--border-strong)' }} />
            </div>

            {/* Remaining sections */}
            <div style={{ padding: '4px 0 8px' }}>
              {secondary.map(item => {
                const active = isNavItemActive(item.href, pathname)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px',
                      padding: '14px 22px',
                      fontSize: '15px',
                      fontWeight: active ? 700 : 500,
                      textDecoration: 'none',
                      color: active ? 'var(--accent)' : 'var(--text-primary)',
                      background: active ? 'var(--accent-subtle)' : 'transparent',
                    }}
                  >
                    <span style={{ flexShrink: 0, opacity: 0.85 }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>

            {/* Display currency — same global preference as the desktop sidebar */}
            <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)' }}>
              <p style={{
                fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px',
              }}>
                Moneda
              </p>
              <div style={{
                display: 'flex', borderRadius: '10px', overflow: 'hidden',
                border: '1px solid var(--border-strong)',
              }}>
                {(['COP', 'USD'] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => setDisplayCurrency(c)}
                    style={{
                      flex: 1, padding: '11px 0', fontSize: '13px', fontWeight: 700,
                      background: displayCurrency === c ? 'var(--accent)' : 'transparent',
                      color: displayCurrency === c ? '#ffffff' : 'var(--text-secondary)',
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Account row */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 22px', borderTop: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '30px', height: '30px', borderRadius: '50%',
                  background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: 700, color: 'var(--accent)',
                }}>
                  {userName?.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                  {userName}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <ThemeToggle />
                <button
                  onClick={handleLogout}
                  aria-label="Cerrar sesión"
                  style={{
                    background: 'transparent', border: '1px solid var(--border-strong)',
                    borderRadius: '8px', cursor: 'pointer', padding: '8px 10px',
                    color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
