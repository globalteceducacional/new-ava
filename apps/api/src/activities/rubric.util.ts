/** Critério de rubrica: weight em fração (0–1) ou porcentagem (0–100). */
export type RubricCriterion = {
  key: string;
  label: string;
  weight: number;
};

export type RubricScores = Record<string, number>;

/**
 * Calcula nota 0–10 a partir dos pesos da rubrica e notas parciais (0–10 cada).
 * Pesos podem somar 1 ou 100 — normalizamos.
 */
export function calculateRubricGrade(
  rubric: RubricCriterion[] | null | undefined,
  scores: RubricScores,
): number {
  if (!rubric?.length) {
    const values = Object.values(scores);
    if (!values.length) return 0;
    return round1(values.reduce((a, b) => a + b, 0) / values.length);
  }

  const weightSum = rubric.reduce((s, c) => s + c.weight, 0) || 1;
  let total = 0;
  for (const c of rubric) {
    const score = scores[c.key] ?? 0;
    total += score * (c.weight / weightSum);
  }
  return round1(total);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
