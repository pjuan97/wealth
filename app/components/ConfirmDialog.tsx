'use client'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open, title, message, onConfirm, onCancel
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onCancel}
      />
      <div
        className="fixed z-50 rounded-xl shadow-2xl"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '400px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-strong)',
          padding: '24px',
        }}
      >
        <h3
          className="font-semibold text-base mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h3>
        <p
          className="text-sm mb-6"
          style={{ color: 'var(--text-secondary)' }}
        >
          {message}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium"
            style={{
              border: '1px solid var(--border-strong)',
              color: 'var(--text-secondary)',
              background: 'transparent',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
            style={{
              background: 'var(--text-primary)',
              color: 'var(--text-inverse)',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </>
  )
}
