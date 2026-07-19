import { prisma } from '@/lib/prisma'

export const VALID_PLAN_MONTHS = [
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
]

// Create or update one PlanVsAchievement row for a single month/category.
// A flat amount is applied to both `base` and `plan` (no inflation/seasonality).
//
// Prisma's compound-unique input type requires non-null values for every
// member field, so a nullable level_3 can't be used with .upsert()'s typed
// `where`. We do the find-then-create/update manually instead — the unique
// constraint on (month_label, event_type, level_2, level_3, user_id) still
// backstops against duplicates at the DB level.
export async function upsertPlanRow(
  userId: number,
  month: string,
  eventType: string,
  level2: string,
  level3: string | null,
  amount: number,
  currency: 'COP' | 'USD' = 'COP'
) {
  const existing = await prisma.planVsAchievement.findFirst({
    where: {
      user_id: userId,
      month_label: month,
      event_type: eventType,
      level_2: level2,
      level_3: level3,
    },
  })

  if (existing) {
    return prisma.planVsAchievement.update({
      where: { id: existing.id },
      data: { base: amount, plan: amount, currency },
    })
  }

  return prisma.planVsAchievement.create({
    data: {
      user_id: userId,
      month_start: new Date(`${month}-01`),
      month_label: month,
      event_type: eventType,
      level_2: level2,
      level_3: level3,
      base: amount,
      inflation: 0,
      seasonality: 0,
      plan: amount,
      currency,
    },
  })
}
