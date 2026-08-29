/**
 * Convierte cada transacción en dólares a la TRM de SU día, no a la de hoy.
 *
 * La importación de agosto usó una sola TRM (la más reciente) para todos los
 * meses, así que una compra de abril quedó valorada a la tasa de agosto. Para
 * un saldo tiene sentido preguntar cuánto valen hoy esos dólares; para un gasto
 * que ya ocurrió, no: costó lo que costó el día que se hizo.
 *
 * Las cuentas en dólares (ARQ) no cambian de saldo, porque se miden en dólares.
 * La tarjeta sí, porque es una cuenta en pesos con cobros en dólares — por eso
 * al final se recalcula su ajuste de cuadre.
 *
 *   npx tsx --env-file=.env prisma/revalorizarTRM.ts [--apply]
 */
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) })
const APPLY = process.argv.includes('--apply')
const USER_ID = 1
const DESDE = '2026-04-01'
const HASTA = '2026-08-29'
const TARJETA = 'Mastercard Black'
const DEUDA_REAL_COP = 2408241   // saldo en pesos del extracto al corte 17/08
const DEUDA_REAL_USD = 334.0     // saldo en dólares del mismo corte
const money = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Una cuenta está en dólares cuando todos sus movimientos se registran en dólares. */
async function esCuentaEnDolares(cuenta: string): Promise<boolean> {
  const [total, soloPesos] = await Promise.all([
    prisma.transaction.count({ where: { user_id: USER_ID, OR: [{ to_account: cuenta }, { from_account: cuenta }] } }),
    prisma.transaction.count({ where: { user_id: USER_ID, usd_amount: null, OR: [{ to_account: cuenta }, { from_account: cuenta }] } }),
  ])
  return total > 0 && soloPesos === 0
}

async function backfillDiarias() {
  let puestas = 0, fallidas = 0
  const fin = new Date(HASTA)
  for (const d = new Date(DESDE); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = new Date(d); date.setUTCHours(0, 0, 0, 0)
    const ds = date.toISOString().slice(0, 10)
    if (await prisma.dailyFxRate.findUnique({ where: { date_currency: { date, currency: 'USD' } } })) continue
    try {
      const r = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${ds}/v1/currencies/usd.json`, { cache: 'no-store' })
      if (!r.ok) { fallidas++; continue }
      const j = await r.json() as { usd?: { cop?: number } }
      const cop = j.usd?.cop
      if (!cop) { fallidas++; continue }
      if (APPLY) {
        await prisma.dailyFxRate.create({
          data: { date, currency: 'USD', rate_to_cop: Math.round(cop * 100) / 100,
                  rate_from_cop: 1 / cop, source: 'fawazahmed0/currency-api' },
        })
      }
      puestas++
    } catch { fallidas++ }
  }
  console.log(`   ${APPLY ? '✓' : '→'} TRM diarias faltantes: ${puestas} rellenadas, ${fallidas} sin dato`)
}

async function main() {
  console.log(`\nRevalorización por TRM del día  ${APPLY ? '⚡ APLICANDO' : '🔍 SIMULACIÓN'}\n`)

  console.log('── Tasas')
  await backfillDiarias()

  // Mapa fecha → TRM, con la del día más cercano anterior cuando falta el exacto.
  const diarias = await prisma.dailyFxRate.findMany({
    where: { currency: 'USD' }, orderBy: { date: 'asc' },
    select: { date: true, rate_to_cop: true },
  })
  const serie = diarias.map(d => ({ t: d.date.getTime(), r: Number(d.rate_to_cop) }))
  const tasaDe = (fecha: Date) => {
    const t = fecha.getTime()
    let mejor = serie[0]?.r ?? 3672
    for (const s of serie) { if (s.t <= t) mejor = s.r; else break }
    return mejor
  }

  // Promedio mensual, para dejar la referencia de FxRate al día
  const meses = ['2026-05', '2026-06', '2026-07', '2026-08']
  for (const m of meses) {
    const delMes = diarias.filter(d => d.date.toISOString().slice(0, 7) === m)
    if (!delMes.length) continue
    const avg = delMes.reduce((s, d) => s + Number(d.rate_to_cop), 0) / delMes.length
    if (APPLY) {
      await prisma.fxRate.upsert({
        where: { month_label_currency: { month_label: m, currency: 'USD' } },
        create: { date: new Date(`${m}-01`), month_label: m, currency: 'USD', rate_to_cop: Math.round(avg * 100) / 100 },
        update: { rate_to_cop: Math.round(avg * 100) / 100 },
      })
    }
    console.log(`   ${APPLY ? '✓' : '→'} FxRate ${m} = ${money(avg)}  (promedio de ${delMes.length} días)`)
  }

  // ── Revalorizar ───────────────────────────────────────────────────────────
  console.log('\n── Transacciones en dólares')

  // Solo se revalúa donde el monto en pesos se DEDUJO de los dólares: una compra
  // con la tarjeta en el exterior, o un movimiento dentro de ARQ. Cuando la plata
  // entró o salió de una cuenta en pesos, el monto en pesos lo registró el banco
  // y es el dato bueno — un traslado de ARQ a Bancolombia trae los dólares del
  // lado de ARQ, pero al banco llegaron unos pesos exactos que no se tocan.
  const cuentasPesos = new Set<string>()
  for (const a of await prisma.accountDef.findMany({ where: { user_id: USER_ID, type: 'cash' }, select: { name: true } })) {
    if (!(await esCuentaEnDolares(a.name))) cuentasPesos.add(a.name)
  }

  const todas = await prisma.transaction.findMany({
    where: { user_id: USER_ID, usd_amount: { not: null },
             date: { gte: new Date(DESDE), lte: new Date(HASTA) } },
    select: { id: true, date: true, usd_amount: true, amount: true, month_label: true,
              from_account: true, to_account: true },
  })
  const intocables = todas.filter(t =>
    (t.from_account && cuentasPesos.has(t.from_account)) ||
    (t.to_account && cuentasPesos.has(t.to_account))
  )
  const txs = todas.filter(t => !intocables.includes(t))
  console.log(`   · ${intocables.length} movimientos conservan su monto en pesos (lo fijó el banco)`)

  // Una corrida anterior sí los revaluó, así que se les devuelve el monto que
  // trae el extracto bancario en el archivo de origen.
  const origen: Array<{ date: string; notes: string; amount: number | null; usd_amount: number | null }> =
    JSON.parse(readFileSync(join(__dirname, 'data', 'tx_ago2026.json'), 'utf8'))
  let reparados = 0
  for (const t of intocables) {
    // El emparejamiento va por fecha Y por monto en dólares: dos movimientos
    // pueden caer el mismo día, y en agosto pasa justamente eso.
    const src = origen.find(o =>
      o.amount !== null && o.usd_amount !== null &&
      o.date === t.date.toISOString().slice(0, 10) &&
      Math.abs(o.usd_amount - Number(t.usd_amount)) < 0.01
    )
    if (!src || src.amount === null || Number(t.amount) === src.amount) continue
    if (APPLY) await prisma.transaction.update({ where: { id: t.id }, data: { amount: src.amount, fx_rate: null } })
    console.log(`   ${APPLY ? '✓' : '→'} ${t.date.toISOString().slice(0, 10)} restaurado a ${money(src.amount)} (estaba en ${money(Number(t.amount))})`)
    reparados++
  }
  if (reparados === 0) console.log('   · ninguno necesitaba reparación')
  const porMes: Record<string, { n: number; antes: number; despues: number }> = {}
  for (const t of txs) {
    const trm = tasaDe(t.date)
    const nuevo = Math.round(Number(t.usd_amount) * trm)
    const m = t.month_label
    porMes[m] ??= { n: 0, antes: 0, despues: 0 }
    porMes[m].n++
    porMes[m].antes += Number(t.amount)
    porMes[m].despues += nuevo
    if (APPLY && nuevo !== Number(t.amount)) {
      await prisma.transaction.update({ where: { id: t.id }, data: { amount: nuevo, fx_rate: trm } })
    }
  }
  console.log('   mes        n        antes           después       diferencia')
  for (const m of Object.keys(porMes).sort()) {
    const x = porMes[m]
    console.log(`   ${m}  ${String(x.n).padStart(4)}  ${money(x.antes).padStart(15)}  ${money(x.despues).padStart(15)}  ${money(x.despues - x.antes).padStart(14)}`)
  }

  // ── Recalcular el ajuste de la tarjeta ────────────────────────────────────
  // Es una cuenta en pesos, así que revalorizar sus cobros en dólares le mueve
  // el saldo; el ajuste tiene que absorber la diferencia otra vez.
  console.log('\n── Ajuste de la tarjeta')
  if (APPLY) {
    await prisma.transaction.deleteMany({
      where: { user_id: USER_ID, notes: { contains: 'Saldo real tarjeta' } },
    })
  }
  const fxHoy = await prisma.dailyFxRate.findFirst({ where: { currency: 'USD' }, orderBy: { date: 'desc' } })
  const TRM_HOY = fxHoy ? Number(fxHoy.rate_to_cop) : 3672
  const objetivo = DEUDA_REAL_COP + Math.round(DEUDA_REAL_USD * TRM_HOY)
  // El ajuste anterior ya se borró arriba, así que aquí se suma todo. Filtrar
  // por `NOT notes contains` sería un error: en SQL esa condición es NULL para
  // las filas sin nota, y esas filas quedarían fuera del total.
  const [cargos, pagos] = await Promise.all([
    prisma.transaction.aggregate({ where: { user_id: USER_ID, from_account: TARJETA }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { user_id: USER_ID, to_account: TARJETA }, _sum: { amount: true } }),
  ])
  const actual = Number(cargos._sum.amount ?? 0) - Number(pagos._sum.amount ?? 0)
  const delta = Math.round((objetivo - actual) * 100) / 100
  if (APPLY && Math.abs(delta) >= 0.01) {
    await prisma.transaction.create({
      data: {
        user_id: USER_ID, date: new Date('2026-08-29'), month_label: '2026-08',
        event_type: 'Opening_Balance', level_1: 'Financial Movement', level_2: 'Financial Movement',
        amount: Math.abs(delta), fx_rate: null, usd_amount: null,
        from_account: delta > 0 ? TARJETA : null,
        to_account: delta > 0 ? null : TARJETA,
        notes: 'Ajuste de cuadre — Saldo real tarjeta al corte 17/08/2026 [import-ago2026]',
      },
    })
  }
  console.log(`   ${APPLY ? '✓' : '→'} deuda ${money(actual)} → ${money(objetivo)}  (ajuste ${delta > 0 ? '+' : ''}${money(delta)})`)

  if (!APPLY) console.log('\n⚠️  Simulación. Nada se escribió.\n')
  else console.log('\n✅ Listo.\n')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
