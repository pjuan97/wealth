export default function PlanPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Plan vs Real
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Budget plan compared to actual execution
        </p>
      </div>
      <div
        className="rounded-xl p-12 text-center"
        style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}
      >
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Coming in WEALTH-007
        </p>
      </div>
    </div>
  )
}
