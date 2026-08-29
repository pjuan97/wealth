/**
 * Alinea el historial de Dollar App (Cash) con los estados de cuenta de ARQ.
 *
 * Los registros de enero a abril venían de antes de esta actualización y no
 * coinciden con los extractos. El más visible es abril: Wealth anota un salario
 * de USD 3.000 que ARQ nunca recibió — su extracto de abril dice "Ingresos
 * $0.00" y el saldo no se mueve en todo el mes ($8.956,55 de principio a fin).
 *
 * Esos errores se venían compensando entre sí, así que el saldo final salía
 * casi bien por casualidad. Corregirlos uno por uno hace que el ajuste de
 * cuadre se encoja hasta casi desaparecer, en vez de crecer.
 *
 *   npx tsx --env-file=.env prisma/fixArqHistorico.ts [--apply] [--solo-abril]
 */
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) })
const APPLY = process.argv.includes('--apply')
const SOLO_ABRIL = process.argv.includes('--solo-abril')
const USER_ID = 1
const CUENTA = 'Dollar App (Cash)'
const SALDO_REAL_USD = 12826.47 // ARQ al 29/08/2026
const money = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Lo que dicen los extractos de ARQ, mes por mes
const CORRECCIONES: Array<{ fecha: string; era: number; debe: number; nota: string }> = [
  { fecha: '2026-01-01', era: 2866, debe: 5165.55, nota: 'Saldo inicial ARQ al 1 de enero' },
  { fecha: '2026-02-01', era: 2300, debe: 2500, nota: 'Compra USDc del 27 de febrero' },
  { fecha: '2026-03-01', era: 2300, debe: 3000, nota: 'Compra USDc del 31 de marzo' },
]

async function main() {
  console.log(`\nHistorial ARQ  ${APPLY ? '⚡ APLICANDO' : '🔍 SIMULACIÓN'}${SOLO_ABRIL ? '  (solo abril)' : ''}\n`)

  // ── El salario fantasma de abril ──────────────────────────────────────────
  const abril = await prisma.transaction.findFirst({
    where: { user_id: USER_ID, to_account: CUENTA, event_type: 'Income', usd_amount: 3000,
             date: { gte: new Date('2026-04-01'), lt: new Date('2026-05-01') } },
  })
  if (!abril) console.log('   · abril: ya corregido')
  else {
    if (APPLY) await prisma.transaction.delete({ where: { id: abril.id } })
    console.log(`   ${APPLY ? '✓' : '→'} abril: eliminado ingreso de USD 3.000 (${money(Number(abril.amount))} COP) que ARQ nunca recibió`)
  }

  // ── Enero a marzo ─────────────────────────────────────────────────────────
  if (!SOLO_ABRIL) {
    for (const c of CORRECCIONES) {
      const t = await prisma.transaction.findFirst({
        where: { user_id: USER_ID, to_account: CUENTA, date: new Date(c.fecha), usd_amount: c.era },
      })
      if (!t) { console.log(`   · ${c.fecha}: ya corregido`); continue }
      if (APPLY) {
        await prisma.transaction.update({
          where: { id: t.id },
          data: { usd_amount: c.debe, amount: Math.round(c.debe * Number(t.fx_rate ?? 3672)) },
        })
      }
      console.log(`   ${APPLY ? '✓' : '→'} ${c.fecha}: USD ${money(c.era)} → ${money(c.debe)}  (${c.nota})`)
    }
  }

  // ── Recalcular el ajuste de cuadre para que el saldo siga dando ───────────
  await prisma.transaction.deleteMany({
    where: { user_id: USER_ID, notes: { contains: 'Saldo real ARQ' } },
  })
  const [ent, sal] = await Promise.all([
    prisma.transaction.aggregate({ where: { user_id: USER_ID, to_account: CUENTA }, _sum: { usd_amount: true } }),
    prisma.transaction.aggregate({ where: { user_id: USER_ID, from_account: CUENTA }, _sum: { usd_amount: true } }),
  ])
  // En simulación las correcciones de arriba todavía no están escritas, así que
  // se descuentan a mano; si no, el ajuste que se reporta sería el de antes.
  let actual = Number(ent._sum.usd_amount ?? 0) - Number(sal._sum.usd_amount ?? 0)
  if (!APPLY) {
    if (abril) actual -= Number(abril.usd_amount ?? 0)
    if (!SOLO_ABRIL) for (const c of CORRECCIONES) actual += c.debe - c.era
  }
  const delta = Math.round((SALDO_REAL_USD - actual) * 100) / 100
  const fx = await prisma.dailyFxRate.findFirst({ where: { currency: 'USD' }, orderBy: { date: 'desc' } })
  const TRM = fx ? Number(fx.rate_to_cop) : 3672

  if (APPLY && Math.abs(delta) >= 0.01) {
    await prisma.transaction.create({
      data: {
        user_id: USER_ID, date: new Date('2026-08-29'), month_label: '2026-08',
        event_type: 'Opening_Balance', level_1: 'Financial Movement', level_2: 'Financial Movement',
        amount: Math.round(Math.abs(delta) * TRM), usd_amount: Math.abs(delta), fx_rate: TRM,
        from_account: delta > 0 ? null : CUENTA,
        to_account: delta > 0 ? CUENTA : null,
        notes: 'Ajuste de cuadre — Saldo real ARQ al 29/08/2026 [import-ago2026]',
      },
    })
  }
  console.log(`\n   Ajuste de cuadre: USD ${money(actual)} → ${money(SALDO_REAL_USD)}  (${delta > 0 ? '+' : ''}${money(delta)})`)
  if (!APPLY) console.log('\n⚠️  Simulación. Nada se escribió.\n')
  else console.log('\n✅ Listo.\n')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
