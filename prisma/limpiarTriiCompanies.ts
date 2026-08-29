/**
 * Borra el bolsillo "Companies" de Trii, que nunca existió.
 *
 * Trii arrastraba dos filas por mes desde mayo — una de tipo ETFs y otra de tipo
 * Companies, esta última con saldos de 172k a 182k que no corresponden a nada:
 * el portafolio real de Trii es 15.695.245 en acciones y ETFs más 9.140.096
 * disponibles sin invertir, y esos 24.835.341 ya cuadran con la plataforma sin
 * el bolsillo extra.
 *
 * Mientras existió, el módulo de Equity leía el mismo cierre para las dos filas
 * y el total del portafolio contaba Trii dos veces.
 *
 *   npx tsx --env-file=.env prisma/limpiarTriiCompanies.ts [--apply]
 */
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) })
const APPLY = process.argv.includes('--apply')
const USER_ID = 1
const PLATAFORMA = 'Trii (Investment)'
const TIPO = 'Companies'

async function main() {
  console.log(`\nLimpieza de Trii/${TIPO}  ${APPLY ? '⚡ APLICANDO' : '🔍 SIMULACIÓN'}\n`)

  const [ejec, prev] = await Promise.all([
    prisma.equityExecuted.findMany({
      where: { user_id: USER_ID, platform: PLATAFORMA, equity_type: TIPO },
      select: { month_label: true, start_balance: true },
      orderBy: { month_label: 'asc' },
    }),
    prisma.equityForecast.findMany({
      where: { user_id: USER_ID, account: PLATAFORMA, equity_type: TIPO },
      select: { month_label: true },
    }),
  ])

  if (ejec.length === 0 && prev.length === 0) {
    console.log('   · ya no existen filas de este tipo\n')
    return
  }

  console.log(`   EquityExecuted: ${ejec.length} filas (${ejec.map(e => e.month_label).join(', ')})`)
  console.log(`   EquityForecast: ${prev.length} filas`)

  if (APPLY) {
    const a = await prisma.equityExecuted.deleteMany({
      where: { user_id: USER_ID, platform: PLATAFORMA, equity_type: TIPO },
    })
    const b = await prisma.equityForecast.deleteMany({
      where: { user_id: USER_ID, account: PLATAFORMA, equity_type: TIPO },
    })
    console.log(`\n   ✓ eliminadas ${a.count + b.count} filas`)
  } else {
    console.log(`\n   → se eliminarían ${ejec.length + prev.length} filas`)
  }

  // Comprobación: qué queda para Trii en agosto
  const restante = await prisma.equityExecuted.findMany({
    where: { user_id: USER_ID, platform: PLATAFORMA, month_label: '2026-08' },
    select: { equity_type: true, market_value_end: true },
  })
  console.log(`\n   Trii en agosto queda como: ${restante.map(r => `${r.equity_type}=${Number(r.market_value_end ?? 0).toLocaleString('es-CO')}`).join(', ') || '(nada)'}`)

  if (!APPLY) console.log('\n⚠️  Simulación. Nada se escribió.\n')
  else console.log('\n✅ Listo.\n')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
