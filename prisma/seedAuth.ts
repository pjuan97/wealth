import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding auth...')

  // Create users
  const juanPassword = await bcrypt.hash('***REMOVED-PASSWORD***', 10)
  const daniPassword = await bcrypt.hash('***REMOVED-PASSWORD***', 10)

  const juan = await prisma.user.upsert({
    where: { email: 'juan@wealth.app' },
    update: {},
    create: {
      email: 'juan@wealth.app',
      password: juanPassword,
      name: 'Juan',
    },
  })

  const dani = await prisma.user.upsert({
    where: { email: 'dani@wealth.app' },
    update: {
      email: 'dani@wealth.app',
      password: daniPassword,
      name: 'Dani',
    },
    create: {
      email: 'dani@wealth.app',
      password: daniPassword,
      name: 'Dani',
    },
  })

  console.log(`Created users: juan (id=${juan.id}), dani (id=${dani.id})`)

  // Migrate ALL existing data to juan
  const [txCount, planCount, efCount, eeCount, accCount, catCount, etCount] = await Promise.all([
    prisma.transaction.updateMany({
      where: { user_id: null },
      data: { user_id: juan.id },
    }),
    prisma.planVsAchievement.updateMany({
      where: { user_id: null },
      data: { user_id: juan.id },
    }),
    prisma.equityForecast.updateMany({
      where: { user_id: null },
      data: { user_id: juan.id },
    }),
    prisma.equityExecuted.updateMany({
      where: { user_id: null },
      data: { user_id: juan.id },
    }),
    prisma.accountDef.updateMany({
      where: { user_id: null },
      data: { user_id: juan.id },
    }),
    prisma.categoryDef.updateMany({
      where: { user_id: null },
      data: { user_id: juan.id },
    }),
    prisma.eventTypeDef.updateMany({
      where: { user_id: null },
      data: { user_id: juan.id },
    }),
  ])

  console.log(`Migrated to juan:`)
  console.log(`  Transactions: ${txCount.count}`)
  console.log(`  PlanVsAchievement: ${planCount.count}`)
  console.log(`  EquityForecast: ${efCount.count}`)
  console.log(`  EquityExecuted: ${eeCount.count}`)
  console.log(`  AccountDef: ${accCount.count}`)
  console.log(`  CategoryDef: ${catCount.count}`)
  console.log(`  EventTypeDef: ${etCount.count}`)

  // New users start with an empty Data Source catalog (no accounts, categories,
  // or event types) — each profile builds its own from scratch rather than
  // inheriting another user's setup.

  console.log('\nAuth seed complete.')
  console.log('Passwords:')
  console.log('  juan@wealth.app → ***REMOVED-PASSWORD***')
  console.log('  dani@wealth.app → ***REMOVED-PASSWORD***')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
