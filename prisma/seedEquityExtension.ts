import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

function annualToMonthly(annual: number): number {
  return Math.pow(1 + annual, 1 / 12) - 1
}

function projectEnd(start: number, monthly_rate: number, contribution = 0, withdrawal = 0): number {
  return Math.round(start * (1 + monthly_rate) + contribution - withdrawal)
}

async function main() {
  console.log('Extending EquityForecast and EquityExecuted to Dec 2026...')

  const ANNUAL_RATE = 0.10
  const MONTHLY_RATE = annualToMonthly(ANNUAL_RATE)

  // Months to add: May–December
  const NEW_MONTHS = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']

  const accounts = [
    { account: 'Bancolombia Fiduciary', equity_type: 'Fiduciary', base: 29140043 },
    { account: 'Trii', equity_type: 'ETFs', base: 16263580 },
    { account: 'Trii', equity_type: 'Companies', base: 166940 },
    { account: 'Dollar App', equity_type: 'ETFs', base: 9829068 },
    { account: 'Tyba', equity_type: 'Collective Investment Funds', base: 19635960 },
  ]

  for (const acct of accounts) {
    // Get the last existing projected_end from April to use as base for May
    const lastForecast = await prisma.equityForecast.findFirst({
      where: { account: acct.account, equity_type: acct.equity_type, month_label: '2026-04' },
    })

    let runningBase = lastForecast
      ? Number(lastForecast.projected_end)
      : projectEnd(acct.base, MONTHLY_RATE)

    for (const month of NEW_MONTHS) {
      const month_start = new Date(`${month}-01`)
      const projected = projectEnd(runningBase, MONTHLY_RATE)

      // Upsert EquityForecast using compound unique key
      await prisma.equityForecast.upsert({
        where: {
          month_label_equity_type_account: {
            month_label: month,
            equity_type: acct.equity_type,
            account: acct.account,
          },
        },
        create: {
          month_start,
          month_label: month,
          equity_type: acct.equity_type,
          account: acct.account,
          base_equity: runningBase,
          annual_rate: ANNUAL_RATE,
          monthly_rate: MONTHLY_RATE,
          planned_contribution: 0,
          planned_withdrawal: 0,
          projected_end: projected,
        },
        update: {
          base_equity: runningBase,
          projected_end: projected,
        },
      })

      // Upsert EquityExecuted (market_value_end null — to be filled manually)
      await prisma.equityExecuted.upsert({
        where: {
          month_label_equity_type_platform: {
            month_label: month,
            equity_type: acct.equity_type,
            platform: acct.account,
          },
        },
        create: {
          month_start,
          month_label: month,
          equity_type: acct.equity_type,
          platform: acct.account,
          start_balance: runningBase,
          market_value_end: null,
        },
        update: {},
      })

      console.log(`  ${acct.account} (${acct.equity_type}) ${month}: base=${runningBase.toLocaleString()}`)
      runningBase = projected
    }
  }

  const forecastCount = await prisma.equityForecast.count()
  const executedCount = await prisma.equityExecuted.count()
  console.log(`\nDone. EquityForecast: ${forecastCount} rows | EquityExecuted: ${executedCount} rows`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
