/**
 * Habilita la LifeMiles en AI Import.
 *
 * La pantalla de AI Import ofrece las cuentas que tienen `import_enabled` en
 * true (ver app/api/ai-import/accounts/route.ts). La LifeMiles se creó en la
 * actualización de agosto sin esa configuración, así que no aparecía en la
 * lista. No hace falta tocar código: basta con dejarle la misma configuración
 * que ya tiene la Mastercard, porque los dos extractos son de Bancolombia y
 * traen el mismo formato (una hoja en pesos y otra en dólares).
 *
 * De paso se le pone una nota de contexto a cada tarjeta, para que el modelo no
 * mezcle una con otra al leer un extracto.
 *
 *   npx tsx --env-file=.env prisma/habilitarImportLifeMiles.ts [--apply]
 */
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) })
const APPLY = process.argv.includes('--apply')

const CONFIG = [
  {
    name: 'LifeMiles',
    import_enabled: true,
    statement_currency: 'USD',
    sign_logic: 'credit_card',
    default_counterparty: 'LifeMiles',
    context_notes:
      'Tarjeta de crédito LifeMiles (termina en 2655), abierta en agosto de 2026. ' +
      'No puede tener movimientos anteriores a agosto de 2026: si el extracto muestra ' +
      'fechas previas, es de otra tarjeta. El extracto trae dos hojas, una en PESOS y ' +
      'otra en DOLARES. Los pagos hechos desde el banco ("ABONO SUCURSAL VIRTUAL", ' +
      '"ABONO DEBITO AUTOMATICO") ya vienen del extracto bancario: omitirlos.',
  },
  {
    name: 'Mastercard Black',
    import_enabled: true,
    statement_currency: 'USD',
    sign_logic: 'credit_card',
    default_counterparty: 'Mastercard Black',
    context_notes:
      'Tarjeta de crédito Mastercard Black (termina en 6073). Fue la única tarjeta ' +
      'hasta agosto de 2026, así que cualquier movimiento de tarjeta anterior a esa ' +
      'fecha es de esta. El extracto trae dos hojas, una en PESOS y otra en DOLARES. ' +
      'Los pagos hechos desde el banco ("PAGO SUC VIRT TC", "ABONO DEBITO AUTOMATICO") ' +
      'ya vienen del extracto bancario: omitirlos. Los ciclos de facturación se ' +
      'traslapan unos días, así que un mismo movimiento puede salir en dos extractos.',
  },
]

async function main() {
  console.log(`\nAI Import — configuración de tarjetas  ${APPLY ? '⚡ APLICANDO' : '🔍 SIMULACIÓN'}\n`)

  // Se aplica a todos los usuarios que tengan la cuenta, no solo a Juan.
  for (const c of CONFIG) {
    const { name, ...datos } = c
    const cuentas = await prisma.accountDef.findMany({ where: { name }, select: { id: true, user_id: true, import_enabled: true } })
    if (cuentas.length === 0) { console.log(`   ! ${name}: no existe`); continue }
    for (const cuenta of cuentas) {
      if (APPLY) await prisma.accountDef.update({ where: { id: cuenta.id }, data: datos })
      const estado = cuenta.import_enabled ? 'ya estaba activa, se refresca el contexto' : 'se activa'
      console.log(`   ${APPLY ? '✓' : '→'} ${name} (usuario ${cuenta.user_id}) — ${estado}`)
    }
  }

  const activas = await prisma.accountDef.findMany({
    where: { user_id: 1, import_enabled: true, is_active: true },
    select: { name: true, statement_currency: true, sign_logic: true },
    orderBy: { name: 'asc' },
  })
  console.log('\n   Cuentas que ofrecerá AI Import:')
  for (const a of activas) console.log(`     · ${a.name} (${a.statement_currency}, ${a.sign_logic})`)

  if (!APPLY) console.log('\n⚠️  Simulación. Nada se escribió.\n')
  else console.log('\n✅ Listo.\n')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
