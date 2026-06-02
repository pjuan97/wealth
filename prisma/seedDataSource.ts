import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding Data Source tables...')

  await prisma.eventTypeDef.deleteMany()
  await prisma.accountDef.deleteMany()
  await prisma.categoryDef.deleteMany()

  // EVENT TYPES
  await prisma.eventTypeDef.createMany({
    data: [
      { name: 'Income' },
      { name: 'Expense' },
      { name: 'Transfer' },
      { name: 'Investment' },
      { name: 'Withdrawal' },
      { name: 'Debt_Payment' },
      { name: 'Debt_Increase' },
      { name: 'Opening_Balance' },
    ],
  })
  console.log('EventTypeDef: 8 rows')

  // ACCOUNTS
  await prisma.accountDef.createMany({
    data: [
      { name: 'Bancolombia (Cash)', type: 'cash' },
      { name: 'Credit Cards', type: 'debt' },
      { name: 'Loans', type: 'debt' },
      { name: 'Bancolombia Fiduciary', type: 'investment' },
      { name: 'Trii', type: 'investment' },
      { name: 'Tyba', type: 'investment' },
      { name: 'Dollar App', type: 'investment' },
      { name: 'Interactive Brokers', type: 'investment' },
    ],
  })
  console.log('AccountDef: 8 rows')

  // CATEGORIES
  await prisma.categoryDef.createMany({
    data: [
      // Income
      { level_1: 'Income', level_2: 'Salary', level_3: null },
      { level_1: 'Income', level_2: 'Other Incomes', level_3: null },
      { level_1: 'Income', level_2: 'Opening Balance', level_3: null },

      // Expense > Life
      { level_1: 'Expense', level_2: 'Life', level_3: 'Food Market' },
      { level_1: 'Expense', level_2: 'Life', level_3: 'Food Outside' },
      { level_1: 'Expense', level_2: 'Life', level_3: 'Host Rent' },
      { level_1: 'Expense', level_2: 'Life', level_3: 'Public Services' },
      { level_1: 'Expense', level_2: 'Life', level_3: 'Transportation' },
      { level_1: 'Expense', level_2: 'Life', level_3: 'Personal Articles' },

      // Expense > Health
      { level_1: 'Expense', level_2: 'Health', level_3: 'Social Security' },
      { level_1: 'Expense', level_2: 'Health', level_3: 'Medicine' },
      { level_1: 'Expense', level_2: 'Health', level_3: 'Health Complementary Plan' },
      { level_1: 'Expense', level_2: 'Health', level_3: 'Gym' },
      { level_1: 'Expense', level_2: 'Health', level_3: 'Protein' },
      { level_1: 'Expense', level_2: 'Health', level_3: 'Hair Treatment' },
      { level_1: 'Expense', level_2: 'Health', level_3: 'Psychology' },
      { level_1: 'Expense', level_2: 'Health', level_3: 'Skin Treatment' },
      { level_1: 'Expense', level_2: 'Health', level_3: 'Dental Treatment' },

      // Expense > Travels
      { level_1: 'Expense', level_2: 'Travels', level_3: 'Other countries' },
      { level_1: 'Expense', level_2: 'Travels', level_3: 'Within Countries' },
      { level_1: 'Expense', level_2: 'Travels', level_3: 'Other Tickets' },

      // Expense > Others
      { level_1: 'Expense', level_2: 'Others', level_3: 'Cloud Store' },
      { level_1: 'Expense', level_2: 'Others', level_3: 'AI (LLM) -ChatGPT' },
      { level_1: 'Expense', level_2: 'Others', level_3: 'Study' },
      { level_1: 'Expense', level_2: 'Others', level_3: 'Celullar Data' },
      { level_1: 'Expense', level_2: 'Others', level_3: 'Spotify' },
      { level_1: 'Expense', level_2: 'Others', level_3: 'Family/Friends' },
      { level_1: 'Expense', level_2: 'Others', level_3: 'Clothes' },
      { level_1: 'Expense', level_2: 'Others', level_3: 'Technology' },
      { level_1: 'Expense', level_2: 'Others', level_3: 'Events' },
      { level_1: 'Expense', level_2: 'Others', level_3: 'Streaming Platforms' },
      { level_1: 'Expense', level_2: 'Others', level_3: 'Dani' },
      { level_1: 'Expense', level_2: 'Others', level_3: 'Other' },

      // Equity
      { level_1: 'Equity', level_2: 'Bank (Cash)', level_3: null },
      { level_1: 'Equity', level_2: 'Fiduciary', level_3: null },
      { level_1: 'Equity', level_2: 'ETFs', level_3: null },
      { level_1: 'Equity', level_2: 'Collective Investment Funds', level_3: null },
      { level_1: 'Equity', level_2: 'Companies', level_3: null },
      { level_1: 'Equity', level_2: 'House', level_3: null },

      // Debt
      { level_1: 'Debt', level_2: 'Credit Cards', level_3: null },
      { level_1: 'Debt', level_2: 'Loans', level_3: null },

      // Financial Movement
      { level_1: 'Financial Movement', level_2: 'Financial Movement', level_3: null },
    ],
  })
  console.log('CategoryDef: 41 rows')

  console.log('\nData Source seed complete.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
