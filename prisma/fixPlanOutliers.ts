/**
 * Corrige dos filas de PlanVsAchievement que quedaron con valores absurdos.
 *
 * En ambos casos los otros once meses del año coinciden entre sí, así que el
 * valor correcto no es una suposición: es el que ya tiene el resto del año.
 *
 *   Life › Host Rent    2026-07   1.972.817.400  →  0          (resto del año: 0)
 *   Life › Food Market  2026-08     174.567.867  →  700.000    (resto del año: 700.000,
 *                                                               y su propio `base` es 700.000)
 *
 *   npx tsx --env-file=.env prisma/fixPlanOutliers.ts [--apply]
 */
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) })
const APPLY = process.argv.includes('--apply')
const money = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const CORRECCIONES = [
  { level_3: 'Host Rent', month_label: '2026-07', correcto: 0 },
  { level_3: 'Food Market', month_label: '2026-08', correcto: 700000 },
]

async function main() {
  console.log(`\nCorrección de planes atípicos  ${APPLY ? '⚡ APLICANDO' : '🔍 SIMULACIÓN'}\n`)

  for (const c of CORRECCIONES) {
    const fila = await prisma.planVsAchievement.findFirst({
      where: { user_id: 1, level_3: c.level_3, month_label: c.month_label },
    })
    if (!fila) {
      console.log(`   ! ${c.level_3} ${c.month_label}: no existe`)
      continue
    }
    const actual = Number(fila.plan)
    if (actual === c.correcto) {
      console.log(`   · ${c.level_3} ${c.month_label}: ya corregido`)
      continue
    }
    if (APPLY) {
      await prisma.planVsAchievement.update({
        where: { id: fila.id },
        data: { plan: c.correcto },
      })
    }
    console.log(
      `   ${APPLY ? '✓' : '→'} ${c.level_3.padEnd(12)} ${c.month_label}  ` +
      `${money(actual).padStart(18)} → ${money(c.correcto)}`
    )
  }

  if (!APPLY) console.log('\n⚠️  Simulación. Corre con --apply para aplicar.\n')
  else console.log('\n✅ Listo.\n')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
