export interface MissionCost { totalDeltaV: number; totalFuel: number; flightSeconds: number }
export type MissionObjective = 'delta_v' | 'time' | 'balanced';

/** Scores include departure, insertion, DOI and powered descent. The balanced
 * penalty is explicitly 100 m/s per day of the complete designed flight. */
export function missionScore(cost: MissionCost, objective: MissionObjective): number {
  if (![cost.totalDeltaV, cost.totalFuel, cost.flightSeconds].every(Number.isFinite)) return Infinity;
  if (objective === 'time') return cost.flightSeconds;
  return cost.totalDeltaV + (objective === 'balanced' ? cost.flightSeconds / 864 : 0);
}
export function betterMission(a: MissionCost, b: MissionCost, objective: MissionObjective): boolean {
  return missionScore(a, objective) < missionScore(b, objective)
    || (missionScore(a, objective) === missionScore(b, objective) && (a.totalFuel < b.totalFuel
      || (a.totalFuel === b.totalFuel && a.flightSeconds < b.flightSeconds)));
}

/** Breadth across approach directions before exhausting one direction's seeds.
 * A failing landing/transfer candidate never suppresses another direction. */
export function interleaveHeadings<T extends { heading: number }>(candidates: T[]): T[] {
  const groups = new Map<number, T[]>();
  for (const candidate of candidates) { const group = groups.get(candidate.heading) ?? []; group.push(candidate); groups.set(candidate.heading, group); }
  const result: T[] = [];
  while ([...groups.values()].some(g => g.length)) for (const group of groups.values()) { const next = group.shift(); if (next) result.push(next); }
  return result;
}
