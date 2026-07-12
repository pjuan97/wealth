import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding import config for existing accounts...')

  const users = await prisma.user.findMany({ select: { id: true } })

  for (const user of users) {
    // Bancolombia (Cash) — bank logic, COP
    await prisma.accountDef.updateMany({
      where: { name: 'Bancolombia (Cash)', user_id: user.id },
      data: {
        import_enabled: true,
        statement_currency: 'COP',
        sign_logic: 'bank',
        default_counterparty: 'Bancolombia (Cash)',
        context_notes: null,
      },
    })

    // Credit Cards — credit card logic, USD
    await prisma.accountDef.updateMany({
      where: { name: 'Credit Cards', user_id: user.id },
      data: {
        import_enabled: true,
        statement_currency: 'USD',
        sign_logic: 'credit_card',
        default_counterparty: 'Credit Cards',
        context_notes: null,
      },
    })
  }

  console.log('Import config seeded for existing accounts')

  // Verify
  const configured = await prisma.accountDef.findMany({
    where: { import_enabled: true },
    select: { name: true, user_id: true, statement_currency: true, sign_logic: true },
  })
  console.log(`\n${configured.length} accounts configured for import:`)
  for (const c of configured) {
    console.log(`  user ${c.user_id} | ${c.name} | ${c.statement_currency} | ${c.sign_logic}`)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
