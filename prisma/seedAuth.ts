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

  // Copy catalog definitions for Dani (AccountDef, CategoryDef, EventTypeDef)
  const [juanAccounts, juanCategories, juanEventTypes] = await Promise.all([
    prisma.accountDef.findMany({ where: { user_id: juan.id } }),
    prisma.categoryDef.findMany({ where: { user_id: juan.id } }),
    prisma.eventTypeDef.findMany({ where: { user_id: juan.id } }),
  ])

  // Only copy if Dani doesn't have them yet
  const daniAccCount = await prisma.accountDef.count({ where: { user_id: dani.id } })
  if (daniAccCount === 0) {
    await prisma.accountDef.createMany({
      data: juanAccounts.map(a => ({
        name: a.name,
        type: a.type,
        is_active: a.is_active,
        user_id: dani.id,
      })),
    })
    await prisma.categoryDef.createMany({
      data: juanCategories.map(c => ({
        level_1: c.level_1,
        level_2: c.level_2,
        level_3: c.level_3,
        is_active: c.is_active,
        user_id: dani.id,
      })),
      skipDuplicates: true,
    })
    await prisma.eventTypeDef.createMany({
      data: juanEventTypes.map(e => ({
        name: e.name,
        is_active: e.is_active,
        user_id: dani.id,
      })),
      skipDuplicates: true,
    })
    console.log(`Copied catalogs to Dani: ${juanAccounts.length} accounts, ${juanCategories.length} categories, ${juanEventTypes.length} event types`)
  }

  console.log('\nAuth seed complete.')
  console.log('Passwords:')
  console.log('  juan@wealth.app → ***REMOVED-PASSWORD***')
  console.log('  dani@wealth.app → ***REMOVED-PASSWORD***')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
