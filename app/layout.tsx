import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from './components/ThemeProvider'
import { CurrencyPreferenceProvider } from './components/CurrencyPreferenceProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Wealth',
  description: 'Personal Finance System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var t = localStorage.getItem('wealth-theme') || 'dark';
              document.documentElement.setAttribute('data-theme', t);
            } catch(e) {}
          })();
        `}} />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <CurrencyPreferenceProvider>
            {children}
          </CurrencyPreferenceProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
