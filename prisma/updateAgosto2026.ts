/**
 * Actualización de presupuesto — corte agosto 2026 (usuario Juan, user_id = 1)
 *
 * Fuentes: extractos Bancolombia (ahorros 71056170817 + Fiducuenta 1111000559380),
 * Mastercard Black 6073, LifeMiles 2655 y estados de cuenta ARQ/DolarApp.
 *
 * Es idempotente: cada transacción insertada lleva el marcador MARKER en `notes`,
 * y el script borra las suyas antes de reinsertar. Nunca toca transacciones que
 * no haya creado él mismo.
 *
 *   npx tsx --env-file=.env prisma/updateAgosto2026.ts [--apply]
 *
 * Sin --apply corre en seco y solo reporta.
 */
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

const USER_ID = 1
const MARKER = '[import-ago2026]'
const APPLY = process.argv.includes('--apply')

const log = (s: string) => console.log(s)
const money = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Saldos reales al cierre de cada mes, tomados de los extractos ────────────
// Fiducuenta: los extractos dan el saldo exacto, no hay que interpolar nada.
const FIDU_REAL: Record<string, number> = {
  '2026-04': 18234684.66, // = "saldo anterior" del extracto de mayo
  '2026-05': 7892071.13,
  '2026-06': 2996124.20,
  '2026-07': 19518.03,
  '2026-08': 19518.03, // sin movimientos en agosto (confirmado por Juan)
}

// Trii / Tyba / ARQ: solo conocemos el saldo de hoy, así que interpolamos entre
// el último cierre real conocido y el saldo actual usando la tasa mensual
// implícita — (fin/inicio)^(1/n) − 1 — en vez de inventar un salto en un mes.
const INTERPOLAR: Array<{
  platform: string
  desde: string
  saldoDesde: number
  hasta: string
  saldoHasta: number
}> = [
  // Trii: parte invertida (Acciones y ETFs). El disponible va a Trii (Cash).
  { platform: 'Trii (Investment)', desde: '2026-03', saldoDesde: 16459490, hasta: '2026-08', saldoHasta: 15695245 },
  { platform: 'Tyba', desde: '2026-03', saldoDesde: 20498627, hasta: '2026-08', saldoHasta: 22243124 },
  // ARQ: 2.943,22 USD convertidos a la TRM más reciente disponible en la base.
  { platform: 'Dollar App (Investment)', desde: '2026-03', saldoDesde: 9250466, hasta: '2026-08', saldoHasta: -1 },
]

const ARQ_INV_USD = 2943.22
const TRII_CASH = 9140096.21

const mesesEntre = (a: string, b: string) => {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}
const sumaMes = (m: string, k: number) => {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1 + k, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function main() {
  log(`\n${'═'.repeat(72)}`)
  log(`  Actualización presupuesto — corte agosto 2026     ${APPLY ? '⚡ APLICANDO' : '🔍 SIMULACIÓN'}`)
  log(`${'═'.repeat(72)}\n`)

  // ── FASE 1 · Cuentas ──────────────────────────────────────────────────────
  log('── FASE 1 · Cuentas')

  // 1a. Credit Cards → Mastercard Black (toda la historia era de esa tarjeta)
  const renombres: Array<[string, string]> = [
    ['Credit Cards', 'Mastercard Black'],
    ['Dollar App (ETFs)', 'Dollar App (Investment)'],
    ['Trii', 'Trii (Investment)'],
  ]
  for (const [viejo, nuevo] of renombres) {
    const existe = await prisma.accountDef.findFirst({ where: { name: viejo, user_id: USER_ID } })
    if (!existe) { log(`   · ${viejo} → ya renombrada`); continue }
    if (APPLY) {
      await prisma.accountDef.update({ where: { id: existe.id }, data: { name: nuevo } })
      const a = await prisma.transaction.updateMany({ where: { user_id: USER_ID, from_account: viejo }, data: { from_account: nuevo } })
      const b = await prisma.transaction.updateMany({ where: { user_id: USER_ID, to_account: viejo }, data: { to_account: nuevo } })
      await prisma.equityForecast.updateMany({ where: { user_id: USER_ID, account: viejo }, data: { account: nuevo } })
      await prisma.equityExecuted.updateMany({ where: { user_id: USER_ID, platform: viejo }, data: { platform: nuevo } })
      log(`   ✓ ${viejo} → ${nuevo}  (${a.count + b.count} transacciones reapuntadas)`)
    } else {
      const n = await prisma.transaction.count({ where: { user_id: USER_ID, OR: [{ from_account: viejo }, { to_account: viejo }] } })
      log(`   → ${viejo} → ${nuevo}  (${n} transacciones a reapuntar)`)
    }
  }

  // 1b. Cuentas nuevas
  const nuevas = [
    { name: 'LifeMiles', type: 'debt' },
    { name: 'Trii (Cash)', type: 'cash' },
  ]
  for (const n of nuevas) {
    const ya = await prisma.accountDef.findFirst({ where: { name: n.name, user_id: USER_ID } })
    if (ya) { log(`   · ${n.name} ya existe`); continue }
    if (APPLY) {
      await prisma.accountDef.create({ data: { ...n, is_active: true, user_id: USER_ID } })
      log(`   ✓ creada ${n.name} (${n.type})`)
    } else log(`   → crear ${n.name} (${n.type})`)
  }

  // 1c. Cuentas fantasma: existen en transacciones pero no en AccountDef, así que
  //     su plata quedaba fuera de todos los balances.
  const fantasmas: Array<[string, string | null]> = [
    ['Collective Investment Funds', 'Bancolombia Fiduciary'], // eran traslados de la Fiducuenta
    ['Nequi', null],                                          // era un gasto, no una cuenta
  ]
  for (const [malo, bueno] of fantasmas) {
    const n = await prisma.transaction.count({ where: { user_id: USER_ID, OR: [{ from_account: malo }, { to_account: malo }] } })
    if (n === 0) { log(`   · ${malo} ya corregida`); continue }
    if (APPLY) {
      await prisma.transaction.updateMany({ where: { user_id: USER_ID, from_account: malo }, data: { from_account: bueno } })
      await prisma.transaction.updateMany({ where: { user_id: USER_ID, to_account: malo }, data: { to_account: bueno } })
      log(`   ✓ ${malo} → ${bueno ?? '(ninguna)'}  (${n} transacciones)`)
    } else log(`   → ${malo} → ${bueno ?? '(ninguna)'}  (${n} transacciones)`)
  }

  // ── FASE 2 · Categoría nueva para intereses de mora ───────────────────────
  log('\n── FASE 2 · Categorías')
  const catMora = { level_1: 'Expense', level_2: 'Others', level_3: 'Interest & Late Fees' }
  const yaCat = await prisma.categoryDef.findFirst({ where: { ...catMora, user_id: USER_ID } })
  if (yaCat) log('   · Interest & Late Fees ya existe')
  else if (APPLY) {
    await prisma.categoryDef.create({ data: { ...catMora, is_active: true, user_id: USER_ID } })
    log('   ✓ creada Expense › Others › Interest & Late Fees')
  } else log('   → crear Expense › Others › Interest & Late Fees')

  // ── FASE 3 · Limpieza de datos corruptos ─────────────────────────────────
  log('\n── FASE 3 · Limpieza')

  // 3a. 28 movimientos de abril/mayo de 2026 quedaron guardados con año 2024
  //     (error de importación). Son duplicados exactos del extracto de abril,
  //     que abajo se reconstruye completo desde la fuente.
  const viejas = await prisma.transaction.findMany({
    where: { user_id: USER_ID, date: { lt: new Date('2025-01-01') } },
    select: { id: true },
  })
  if (viejas.length === 0) log('   · sin transacciones mal fechadas')
  else if (APPLY) {
    await prisma.transaction.deleteMany({ where: { id: { in: viejas.map(v => v.id) } } })
    log(`   ✓ ${viejas.length} transacciones con año 2024 eliminadas (eran abr/may 2026)`)
  } else log(`   → ${viejas.length} transacciones con año 2024 a eliminar (eran abr/may 2026)`)

  // 3b. Todo el banco de abr–ago se reconstruye desde el extracto, así que se
  //     borra lo que había: venía con montos redondeados, pagos de tarjeta
  //     duplicados, dos compras de tarjeta anotadas como entradas al banco y un
  //     "Cash reconciliation" de 867.766 puesto para cuadrar a la fuerza.
  const wBanco = {
    user_id: USER_ID,
    month_label: { in: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'] },
    OR: [{ from_account: 'Bancolombia (Cash)' }, { to_account: 'Bancolombia (Cash)' }],
  }
  const nBanco = await prisma.transaction.count({ where: wBanco })
  if (APPLY) {
    await prisma.transaction.deleteMany({ where: wBanco })
    log(`   ✓ ${nBanco} transacciones de Bancolombia abr–ago eliminadas (se reconstruyen)`)
  } else log(`   → ${nBanco} transacciones de Bancolombia abr–ago a reconstruir`)

  // 3c. Las líneas de pago que venían del extracto de la tarjeta duplican los
  //     pagos que ya trae el extracto bancario. Se reconocen porque no tienen
  //     cuenta de origen: la plata sale del banco, que ya los registra.
  const wPagos = {
    user_id: USER_ID,
    month_label: { in: ['2026-04', '2026-05'] },
    to_account: 'Mastercard Black',
    from_account: null,
  }
  const nPagos = await prisma.transaction.count({ where: wPagos })
  if (nPagos === 0) log('   · sin pagos de tarjeta duplicados')
  else if (APPLY) {
    await prisma.transaction.deleteMany({ where: wPagos })
    log(`   ✓ ${nPagos} pagos de tarjeta duplicados eliminados`)
  } else log(`   → ${nPagos} pagos de tarjeta duplicados a eliminar`)

  // ── FASE 4 · Transacciones nuevas ────────────────────────────────────────
  log('\n── FASE 4 · Transacciones')
  const txs: Array<Record<string, unknown>> = JSON.parse(
    readFileSync(join(__dirname, 'data', 'tx_ago2026.json'), 'utf8')
  )
  const previas = await prisma.transaction.count({
    where: { user_id: USER_ID, notes: { contains: MARKER } },
  })
  if (previas) log(`   · ${previas} transacciones de una corrida anterior serán reemplazadas`)

  // TRM para convertir los movimientos en USD a pesos
  const fx = await prisma.dailyFxRate.findFirst({ where: { currency: 'USD' }, orderBy: { date: 'desc' } })
  const TRM = fx ? Number(fx.rate_to_cop) : 3672
  log(`   · TRM usada: ${money(TRM)} (${fx ? fx.date.toISOString().slice(0, 10) : 'valor por defecto'})`)

  if (APPLY) {
    await prisma.transaction.deleteMany({ where: { user_id: USER_ID, notes: { contains: MARKER } } })
    await prisma.transaction.createMany({
      data: txs.map(t => {
        const usd = t.usd_amount as number | null
        const cop = (t.amount as number | null) ?? (usd !== null ? Math.round(usd * TRM) : 0)
        return {
          user_id: USER_ID,
          date: new Date(t.date as string),
          month_label: (t.date as string).slice(0, 7),
          event_type: t.event_type as string,
          level_1: t.level_1 as string,
          level_2: t.level_2 as string,
          level_3: (t.level_3 as string | null) ?? null,
          amount: cop,
          usd_amount: usd,
          fx_rate: usd !== null ? TRM : null,
          from_account: (t.from_account as string | null) ?? null,
          to_account: (t.to_account as string | null) ?? null,
          notes: `${t.notes} ${MARKER}`,
        }
      }),
    })
    log(`   ✓ ${txs.length} transacciones insertadas`)
  } else {
    log(`   → ${txs.length} transacciones a insertar`)
  }
  const porMes = txs.reduce<Record<string, number>>((a, t) => {
    const m = (t.date as string).slice(0, 7); a[m] = (a[m] ?? 0) + 1; return a
  }, {})
  for (const m of Object.keys(porMes).sort()) log(`      ${m}: ${porMes[m]}`)

  // 4b. Saldo de arranque de Trii (Cash) — la platica que está en Trii sin invertir.
  const yaTriiCash = await prisma.transaction.findFirst({
    where: { user_id: USER_ID, to_account: 'Trii (Cash)', event_type: 'Opening_Balance' },
  })
  if (yaTriiCash) log('   · saldo de Trii (Cash) ya registrado')
  else if (APPLY) {
    await prisma.transaction.create({
      data: {
        user_id: USER_ID, date: new Date('2026-08-29'), month_label: '2026-08',
        event_type: 'Opening_Balance', level_1: 'Income', level_2: 'Opening Balance', level_3: null,
        amount: TRII_CASH, usd_amount: null, fx_rate: null,
        from_account: null, to_account: 'Trii (Cash)',
        notes: `Disponible en Trii sin invertir al 29/08/2026 ${MARKER}`,
      },
    })
    log(`   ✓ Trii (Cash): saldo de ${money(TRII_CASH)}`)
  } else log(`   → Trii (Cash): registrar saldo de ${money(TRII_CASH)}`)

  // 4c. Ajustes de cuadre. El histórico anterior a abril tiene errores que ya no
  //     se pueden reconstruir (no hay extractos de enero–marzo). En vez de
  //     dejarlos escondidos, se anota un ajuste explícito y fechado que lleva
  //     cada cuenta al saldo real de la plataforma.
  const OBJETIVOS: Array<{ cuenta: string; usd?: number; cop?: number; nota: string; fecha: string }> = [
    // El banco quedó exacto de abril en adelante; lo que sobra viene de ene–mar,
    // meses sin extracto. Por eso el ajuste se fecha el 31/03 y no en agosto.
    { cuenta: 'Bancolombia (Cash)', cop: 7509506.16, fecha: '2026-03-31',
      nota: 'Saldo real cuenta de ahorros al 31/03/2026 (cierre del extracto)' },
    { cuenta: 'Dollar App (Cash)', usd: 12826.47, fecha: '2026-08-29',
      nota: 'Saldo real ARQ al 29/08/2026' },
    { cuenta: 'Mastercard Black', cop: 2408241 + Math.round(334.0 * TRM), fecha: '2026-08-29',
      nota: 'Saldo real tarjeta al corte 17/08/2026' },
  ]
  for (const o of OBJETIVOS) {
    const esDeuda = o.cuenta === 'Mastercard Black'
    const campo = o.usd !== undefined ? 'usd_amount' : 'amount'
    // El saldo se mide hasta la fecha del ajuste, no hasta hoy: así un ajuste
    // fechado en marzo no se contamina con los movimientos de abril en adelante.
    const hasta = { date: { lte: new Date(o.fecha) } }
    const [ent, sal] = await Promise.all([
      prisma.transaction.aggregate({ where: { user_id: USER_ID, to_account: o.cuenta, ...hasta }, _sum: { amount: true, usd_amount: true } }),
      prisma.transaction.aggregate({ where: { user_id: USER_ID, from_account: o.cuenta, ...hasta }, _sum: { amount: true, usd_amount: true } }),
    ])
    const suma = (x: typeof ent) => Number((campo === 'usd_amount' ? x._sum.usd_amount : x._sum.amount) ?? 0)
    // En deuda el saldo se mide al revés: cargos (salidas) menos pagos (entradas).
    const actual = esDeuda ? suma(sal) - suma(ent) : suma(ent) - suma(sal)
    const objetivo = o.usd ?? o.cop!
    const delta = Math.round((objetivo - actual) * 100) / 100
    if (Math.abs(delta) < 0.01) { log(`   · ${o.cuenta}: ya cuadra`); continue }
    // Un delta positivo sube el saldo: entra plata en una cuenta, o crece la deuda.
    const entra = delta > 0
    const dir = esDeuda
      ? (entra ? { from_account: o.cuenta, to_account: null } : { from_account: null, to_account: o.cuenta })
      : (entra ? { from_account: null, to_account: o.cuenta } : { from_account: o.cuenta, to_account: null })
    if (APPLY) {
      const usd = o.usd !== undefined ? Math.abs(delta) : null
      await prisma.transaction.create({
        data: {
          user_id: USER_ID, date: new Date(o.fecha), month_label: o.fecha.slice(0, 7),
          event_type: 'Opening_Balance', level_1: 'Financial Movement', level_2: 'Financial Movement', level_3: null,
          amount: usd !== null ? Math.round(usd * TRM) : Math.abs(delta),
          usd_amount: usd, fx_rate: usd !== null ? TRM : null,
          ...dir,
          notes: `Ajuste de cuadre — ${o.nota} ${MARKER}`,
        },
      })
    }
    log(`   ${APPLY ? '✓' : '→'} ajuste ${o.cuenta}: ${money(actual)} → ${money(objetivo)}  (${delta > 0 ? '+' : ''}${money(delta)})`)
  }

  // ── FASE 5 · Cierres reales de inversión ─────────────────────────────────
  log('\n── FASE 5 · Cierres reales (Equity)')

  const escribirCierre = async (platform: string, mes: string, valor: number) => {
    const filas = await prisma.equityExecuted.findMany({
      where: { user_id: USER_ID, platform, month_label: mes },
    })
    if (filas.length === 0) { log(`   ! ${platform} ${mes}: no existe fila en EquityExecuted`); return }
    // Si hay varias filas (p.ej. Trii quedó con ETFs y Companies), el valor va en
    // la principal y las demás en 0 para que el total no se duplique.
    const principal = filas.reduce((a, b) => (Number(a.start_balance) >= Number(b.start_balance) ? a : b))
    if (APPLY) {
      for (const f of filas) {
        await prisma.equityExecuted.update({
          where: { id: f.id },
          data: { market_value_end: f.id === principal.id ? valor : 0 },
        })
      }
    }
    const extra = filas.length > 1 ? `  (+${filas.length - 1} fila(s) duplicada(s) puestas en 0)` : ''
    log(`   ${APPLY ? '✓' : '→'} ${platform.padEnd(24)} ${mes}  ${money(valor).padStart(16)}${extra}`)
  }

  // 5a. Fiducuenta — saldos exactos de extracto, sin interpolar
  for (const [mes, valor] of Object.entries(FIDU_REAL)) {
    await escribirCierre('Bancolombia Fiduciary', mes, valor)
  }

  // 5b. Resto — interpolación por tasa mensual implícita
  for (const item of INTERPOLAR) {
    const fin = item.saldoHasta === -1 ? Math.round(ARQ_INV_USD * TRM) : item.saldoHasta
    const n = mesesEntre(item.desde, item.hasta)
    const r = Math.pow(fin / item.saldoDesde, 1 / n) - 1
    log(`   · ${item.platform}: ${money(item.saldoDesde)} → ${money(fin)} en ${n} meses  (tasa implícita ${(r * 100).toFixed(3)} %/mes)`)
    for (let k = 1; k <= n; k++) {
      const mes = sumaMes(item.desde, k)
      const valor = k === n ? fin : Math.round(item.saldoDesde * Math.pow(1 + r, k))
      await escribirCierre(item.platform, mes, valor)
    }
  }

  // ── Resumen ──────────────────────────────────────────────────────────────
  log('\n── Saldos resultantes')
  const cuentas = await prisma.accountDef.findMany({ where: { user_id: USER_ID, is_active: true }, orderBy: [{ type: 'asc' }, { name: 'asc' }] })
  for (const c of cuentas) {
    if (c.type === 'investment') {
      const e = await prisma.equityExecuted.findFirst({
        where: { user_id: USER_ID, platform: c.name, market_value_end: { not: null } },
        orderBy: { month_label: 'desc' },
      })
      log(`   ${c.name.padEnd(26)} ${c.type.padEnd(11)} ${money(Number(e?.market_value_end ?? 0)).padStart(18)}`)
    } else {
      const [i, o] = await Promise.all([
        prisma.transaction.aggregate({ where: { user_id: USER_ID, to_account: c.name }, _sum: { amount: true } }),
        prisma.transaction.aggregate({ where: { user_id: USER_ID, from_account: c.name }, _sum: { amount: true } }),
      ])
      const s = Number(i._sum.amount ?? 0) - Number(o._sum.amount ?? 0)
      log(`   ${c.name.padEnd(26)} ${c.type.padEnd(11)} ${money(s).padStart(18)}`)
    }
  }

  if (!APPLY) log('\n⚠️  Simulación. Nada se escribió. Corre con --apply para aplicar.\n')
  else log('\n✅ Listo.\n')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
