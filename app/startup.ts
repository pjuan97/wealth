// Server-side startup — runs once when Next.js server starts
import { startFxCron } from '@/lib/fxCron'

let initialized = false

export function initializeServer() {
  if (initialized) return
  initialized = true
  startFxCron()
}
