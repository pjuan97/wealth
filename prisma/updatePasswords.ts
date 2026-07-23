// One-off script to rotate both users' passwords before going to production.
// Reads the new plaintext passwords from environment variables — never
// hardcode them here, and never print them back out.
//
// Usage:
//   JUAN_NEW_PASSWORD="..." DANI_NEW_PASSWORD="..." npx tsx --env-file=.env prisma/updatePasswords.ts
//
// (Pass the two vars on the command line rather than putting them in .env,
// so they don't linger in a file after the run.)

import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

async function main() {
  const juanPassword = process.env.JUAN_NEW_PASSWORD
  const daniPassword = process.env.DANI_NEW_PASSWORD

  if (!juanPassword || !daniPassword) {
    throw new Error(
      'Set JUAN_NEW_PASSWORD and DANI_NEW_PASSWORD env vars before running this script.'
    )
  }
  if (juanPassword.length < 11 || daniPassword.length < 11) {
    throw new Error('Both passwords must be at least 11 characters.')
  }

  const [juanHash, daniHash] = await Promise.all([
    bcrypt.hash(juanPassword, 12),
    bcrypt.hash(daniPassword, 12),
  ])

  const [juan, dani] = await Promise.all([
    prisma.user.update({
      where: { email: 'juan@wealth.app' },
      data: { password: juanHash },
    }),
    prisma.user.update({
      where: { email: 'dani@wealth.app' },
      data: { password: daniHash },
    }),
  ])

  console.log(`Password updated for ${juan.email} (id=${juan.id})`)
  console.log(`Password updated for ${dani.email} (id=${dani.id})`)
  console.log('Done — old passwords no longer work.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
