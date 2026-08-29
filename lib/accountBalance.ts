import { prisma } from './prisma'

/**
 * An account holds dollars when every movement through it is recorded in
 * dollars — as with Dollar App, where the salary lands in USDc. An account that
 * has any peso-only line (a bank account, or a card that charges in both) holds
 * pesos, even if some of its lines also note a dollar figure: those pesos
 * already landed and do not get revalued.
 */
export async function isDollarAccount(userId: number, account: string): Promise<boolean> {
  const [total, copOnly] = await Promise.all([
    prisma.transaction.count({
      where: { user_id: userId, OR: [{ to_account: account }, { from_account: account }] },
    }),
    prisma.transaction.count({
      where: {
        user_id: userId,
        usd_amount: null,
        OR: [{ to_account: account }, { from_account: account }],
      },
    }),
  ])
  return total > 0 && copOnly === 0
}

/**
 * Balance of one account, in both currencies.
 *
 * A dollar account is valued at TODAY's rate rather than at the rate of the day
 * each movement happened: the question a balance answers is "how much do I have
 * right now", and a dollar held since January is worth today's rate, not
 * January's.
 */
export async function accountBalance(
  userId: number,
  account: string,
  currentFX: number,
  upTo?: Date
): Promise<{ cop: number; usd: number }> {
  const dateFilter = upTo ? { date: { lt: upTo } } : {}
  const enDolares = await isDollarAccount(userId, account)
  const field = enDolares ? 'usd_amount' : 'amount'
  const [inflow, outflow] = await Promise.all([
    prisma.transaction.aggregate({
      where: { user_id: userId, to_account: account, ...dateFilter },
      _sum: { amount: true, usd_amount: true },
    }),
    prisma.transaction.aggregate({
      where: { user_id: userId, from_account: account, ...dateFilter },
      _sum: { amount: true, usd_amount: true },
    }),
  ])
  const net = (x: typeof inflow) =>
    Number((field === 'usd_amount' ? x._sum.usd_amount : x._sum.amount) || 0)
  const balance = net(inflow) - net(outflow)
  return enDolares
    ? { cop: balance * currentFX, usd: balance }
    : { cop: balance, usd: balance / currentFX }
}

/**
 * What every investment platform is worth, added up.
 *
 * A platform can hold several rows in the same month (one per equity_type, e.g.
 * ETFs and Companies), so for each platform this takes the latest month that
 * carries a manual value and adds that whole month up. Reading a single row
 * would silently drop the rest of the portfolio.
 */
export async function totalInvestments(userId: number): Promise<number> {
  const rows = await prisma.equityExecuted.findMany({
    where: { user_id: userId, market_value_end: { not: null } },
    orderBy: { month_label: 'desc' },
  })
  const latestMonth = new Map<string, string>()
  for (const r of rows) {
    if (!latestMonth.has(r.platform)) latestMonth.set(r.platform, r.month_label)
  }
  return rows
    .filter(r => latestMonth.get(r.platform) === r.month_label)
    .reduce((s, r) => s + Number(r.market_value_end ?? 0), 0)
}
