export default function DashboardPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        padding: '20px 32px 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Dashboard
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          KPIs, charts, and monthly summary
        </p>
      </div>
      <div style={{ padding: '32px' }}>
        <div
          style={{
            border: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            borderRadius: '12px',
            padding: '48px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Coming in WEALTH-010
          </p>
        </div>
      </div>
    </div>
  )
}
