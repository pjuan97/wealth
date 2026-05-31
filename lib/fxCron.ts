import { fetchAndStoreTodayRate } from './fxService'

let cronStarted = false

export function startFxCron() {
  if (cronStarted) return
  cronStarted = true

  const runFetch = async () => {
    try {
      const result = await fetchAndStoreTodayRate()
      if (!result.cached) {
        console.log(`[FX Cron] Fetched TRM: 1 USD = ${result.rate_to_cop} COP (${result.date})`)
      }
    } catch (err) {
      console.error('[FX Cron] Failed to fetch TRM:', err)
    }
  }

  // Run immediately on startup
  runFetch()

  // Run every 24 hours
  setInterval(runFetch, 24 * 60 * 60 * 1000)
}
