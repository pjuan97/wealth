export default function BalancesPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Balances
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Account balances and net worth
        </p>
      </div>
      <div
        className="rounded-xl p-12 text-center"
        style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}
      >
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Coming in WEALTH-005
        </p>
      </div>
    </div>
  )
}
