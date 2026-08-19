'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import ThemeToggle from './ThemeToggle'
import { useCurrencyPreference } from './CurrencyPreferenceProvider'
import { NAV_ITEMS, isNavItemActive } from './navItems'

// Desktop / tablet navigation. On phones this is hidden by the `desktop-only`
// class and MobileNav's bottom tab bar takes over — at 375px this 160px rail
// was eating 43% of the screen.
export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userName, setUserName] = useState<string>('')
  const { displayCurrency, setDisplayCurrency } = useCurrencyPreference()

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => setUserName(data.user?.name || ''))
      .catch(() => {})
  }, [])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <aside
      className="desktop-only"
      style={{
        width: '160px',
        minWidth: '160px',
        height: '100dvh',
        position: 'sticky',
        top: 0,
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        className="px-6 py-5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span
          style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '16px' }}
        >
          Wealth
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = isNavItemActive(item.href, pathname)

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                fontSize: '13px',
                fontWeight: 500,
                textDecoration: 'none',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                background: isActive ? 'var(--accent-subtle)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                transition: 'all 0.1s',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'
                }
              }}
            >
              <span style={{ flexShrink: 0, opacity: 0.8 }}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Display currency toggle — applies across the whole app */}
      <div style={{ padding: '10px 16px 0', flexShrink: 0 }}>
        <div style={{
          display: 'flex', borderRadius: '8px', overflow: 'hidden',
          border: '1px solid var(--border-strong)', width: '100%',
        }}>
          {(['COP', 'USD'] as const).map(c => (
            <button
              key={c}
              onClick={() => setDisplayCurrency(c)}
              title={`Show all amounts in ${c}`}
              style={{
                flex: 1, padding: '6px 0', fontSize: '11px', fontWeight: 700,
                background: displayCurrency === c ? 'var(--accent)' : 'transparent',
                color: displayCurrency === c ? '#ffffff' : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer',
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '24px', height: '24px',
            borderRadius: '50%',
            background: 'var(--accent-subtle)',
            border: '1px solid var(--accent-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 700, color: 'var(--accent)',
          }}>
            {userName?.charAt(0).toUpperCase()}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {userName}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <ThemeToggle />
          <button
            onClick={handleLogout}
            title="Sign out"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: 'var(--text-muted)',
              fontSize: '14px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
