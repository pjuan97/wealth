import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Migrating Dollar App → Dollar App (Cash) + Dollar App (ETFs)...')

  const USER_ID = 1

  // ── PASO 1: Crear nuevas cuentas en AccountDef ─────────────────────────────

  // Desactivar la cuenta vieja
  await prisma.accountDef.updateMany({
    where: { name: 'Dollar App', user_id: USER_ID },
    data: { is_active: false },
  })
  console.log('Deactivated old Dollar App account')

  // Crear Dollar App (Cash) — type: cash
  const cashAccount = await prisma.accountDef.upsert({
    where: { name_user_id: { name: 'Dollar App (Cash)', user_id: USER_ID } },
    update: { is_active: true, type: 'cash' },
    create: {
      name: 'Dollar App (Cash)',
      type: 'cash',
      is_active: true,
      user_id: USER_ID,
    },
  })
  console.log(`Created Dollar App (Cash) — id: ${cashAccount.id}`)

  // Crear Dollar App (ETFs) — type: investment
  const etfAccount = await prisma.accountDef.upsert({
    where: { name_user_id: { name: 'Dollar App (ETFs)', user_id: USER_ID } },
    update: { is_active: true, type: 'investment' },
    create: {
      name: 'Dollar App (ETFs)',
      type: 'investment',
      is_active: true,
      user_id: USER_ID,
    },
  })
  console.log(`Created Dollar App (ETFs) — id: ${etfAccount.id}`)

  // También para Dani (user_id = 2)
  await prisma.accountDef.upsert({
    where: { name_user_id: { name: 'Dollar App (Cash)', user_id: 2 } },
    update: { is_active: true, type: 'cash' },
    create: { name: 'Dollar App (Cash)', type: 'cash', is_active: true, user_id: 2 },
  })
  await prisma.accountDef.upsert({
    where: { name_user_id: { name: 'Dollar App (ETFs)', user_id: 2 } },
    update: { is_active: true, type: 'investment' },
    create: { name: 'Dollar App (ETFs)', type: 'investment', is_active: true, user_id: 2 },
  })
  console.log('Created accounts for Dani too')

  // ── PASO 2: Migrar EquityForecast ──────────────────────────────────────────
  await prisma.equityForecast.updateMany({
    where: { account: 'Dollar App', user_id: USER_ID },
    data: { account: 'Dollar App (ETFs)' },
  })
  console.log('Updated EquityForecast: Dollar App → Dollar App (ETFs)')

  // ── PASO 3: Migrar EquityExecuted ──────────────────────────────────────────
  await prisma.equityExecuted.updateMany({
    where: { platform: 'Dollar App', user_id: USER_ID },
    data: { platform: 'Dollar App (ETFs)' },
  })
  console.log('Updated EquityExecuted: Dollar App → Dollar App (ETFs)')

  // ── PASO 4: Migrar Transactions ────────────────────────────────────────────

  // Opening_Balance $2,607 USD (9,828,390 COP) → ETFs
  await prisma.transaction.updateMany({
    where: {
      user_id: USER_ID,
      event_type: 'Opening_Balance',
      to_account: 'Dollar App',
      amount: { gte: 9828000, lte: 9829000 },
    },
    data: { to_account: 'Dollar App (ETFs)' },
  })
  console.log('Migrated Opening_Balance ETFs tx')

  // Opening_Balance $2,866 USD (10,804,820 COP) → Cash
  await prisma.transaction.updateMany({
    where: {
      user_id: USER_ID,
      event_type: 'Opening_Balance',
      to_account: 'Dollar App',
      amount: { gte: 10804000, lte: 10806000 },
    },
    data: { to_account: 'Dollar App (Cash)' },
  })
  console.log('Migrated Opening_Balance Cash tx')

  // Income (todos los salarios) → Cash
  await prisma.transaction.updateMany({
    where: {
      user_id: USER_ID,
      event_type: 'Income',
      to_account: 'Dollar App',
    },
    data: { to_account: 'Dollar App (Cash)' },
  })
  console.log('Migrated all Income txs → Dollar App (Cash)')

  // ── Transfers: agregar usd_amount y fx_rate ────────────────────────────────

  // Feb transfer: $14,685,427 COP
  const febTransfer = await prisma.transaction.findFirst({
    where: {
      user_id: USER_ID,
      event_type: 'Transfer',
      from_account: 'Dollar App',
      amount: { gte: 14685000, lte: 14686000 },
    },
  })
  if (febTransfer) {
    const febTRM = await prisma.dailyFxRate.findFirst({
      where: {
        date: { gte: new Date('2026-02-05'), lte: new Date('2026-02-06') },
        currency: 'USD',
      },
    })
    const febTRM2 = febTRM?.rate_to_cop
      ? Number(febTRM.rate_to_cop)
      : 3717 // fallback TRM feb 2026
    const febUSD = Math.round((14685427 / febTRM2) * 100) / 100
    await prisma.transaction.update({
      where: { id: febTransfer.id },
      data: {
        from_account: 'Dollar App (Cash)',
        usd_amount: febUSD,
        fx_rate: febTRM2,
      },
    })
    console.log(`Migrated Feb transfer → Dollar App (Cash), USD: ${febUSD} at TRM: ${febTRM2}`)
  }

  // May transfer: $3,720,000 COP
  const mayTransfer = await prisma.transaction.findFirst({
    where: {
      user_id: USER_ID,
      event_type: 'Transfer',
      from_account: 'Dollar App',
      amount: { gte: 3719000, lte: 3721000 },
    },
  })
  if (mayTransfer) {
    const mayTRM = await prisma.dailyFxRate.findFirst({
      where: {
        date: { gte: new Date('2026-05-05'), lte: new Date('2026-05-06') },
        currency: 'USD',
      },
    })
    const mayTRM2 = mayTRM?.rate_to_cop
      ? Number(mayTRM.rate_to_cop)
      : 3670 // fallback TRM may 2026
    const mayUSD = Math.round((3720000 / mayTRM2) * 100) / 100
    await prisma.transaction.update({
      where: { id: mayTransfer.id },
      data: {
        from_account: 'Dollar App (Cash)',
        usd_amount: mayUSD,
        fx_rate: mayTRM2,
      },
    })
    console.log(`Migrated May transfer → Dollar App (Cash), USD: ${mayUSD} at TRM: ${mayTRM2}`)
  }

  // ── PASO 5: Verificación final ─────────────────────────────────────────────
  const txCheck = await prisma.transaction.findMany({
    where: {
      user_id: USER_ID,
      OR: [
        { from_account: { contains: 'Dollar App' } },
        { to_account: { contains: 'Dollar App' } },
      ],
    },
    select: { event_type: true, from_account: true, to_account: true, amount: true, usd_amount: true, date: true },
    orderBy: { date: 'asc' },
  })

  console.log('\n=== Final transaction check ===')
  for (const tx of txCheck) {
    console.log(`${tx.date.toISOString().split('T')[0]} | ${tx.event_type} | ${tx.from_account || '—'} → ${tx.to_account || '—'} | COP: ${tx.amount} | USD: ${tx.usd_amount || '—'}`)
  }

  const remaining = txCheck.filter(tx =>
    tx.from_account === 'Dollar App' || tx.to_account === 'Dollar App'
  )
  if (remaining.length > 0) {
    console.log(`\n⚠️ WARNING: ${remaining.length} transactions still use old 'Dollar App' account`)
  } else {
    console.log('\n✅ All Dollar App transactions migrated successfully')
  }

  console.log('\nMigration complete.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
