import Sidebar from '../components/Sidebar'
import MobileNav from '../components/MobileNav'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // 100dvh rather than 100vh: on mobile browsers the address bar shrinks the
    // visible area, and 100vh would push the bottom of the app off-screen.
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <Sidebar />
      <main className="app-main" style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        {children}
      </main>
      <MobileNav />
    </div>
  )
}
