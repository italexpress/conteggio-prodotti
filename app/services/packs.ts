export const COMPOSITIONS: Record<string, Record<string, number>> = {
  "S/M/L/XL": { S: 1, M: 1, L: 1, XL: 1 },
  "S/M/M/L/L/XL": { S: 1, M: 2, L: 2, XL: 1 },
  "S/M/L/XL/XXL": { S: 1, M: 1, L: 1, XL: 1, XXL: 1 },
  "S/M/M/L/L/XL/XXL": { S: 1, M: 2, L: 2, XL: 1, XXL: 1 },
};
export function normalizeSize(value: string) {
  const size = value.trim().toUpperCase();
  return size === "2XL" ? "XXL" : size;
}
export function compatibleCompositions(sizes: string[]) {
  return Object.keys(COMPOSITIONS).filter(key => Object.keys(COMPOSITIONS[key]).every(size => sizes.includes(size)));
}
export interface PackVariant { id: string; size: string; group: string; sku: string; demand: number }
export function minimumPacks(variants: PackVariant[], composition: string): { count: number | null; reason: string | null } {
  const recipe = COMPOSITIONS[composition];
  if (!recipe) return { count: null, reason: "Seleziona una composizione" };
  let count = 0;
  for (const variant of variants.filter(v => v.demand > 0)) {
    if (!recipe[variant.size]) return { count: null, reason: `Taglia ${variant.size || "sconosciuta"} non coperta` };
    count = Math.max(count, Math.ceil(variant.demand / recipe[variant.size]));
  }
  return { count, reason: null };
}

export function summarizePacks(variants: PackVariant[], composition: string) {
  const plan = minimumPacks(variants, composition);
  const sold: Record<string, number> = {};
  for (const variant of variants) if (variant.demand > 0) sold[variant.size || '?'] = (sold[variant.size || '?'] || 0) + variant.demand;
  const piecesPerPack = Object.values(COMPOSITIONS[composition] || {}).reduce((sum, quantity) => sum + quantity, 0);
  const totalSold = Object.values(sold).reduce((sum, quantity) => sum + quantity, 0);
  return { ...plan, sold, remaining: plan.count === null ? null : plan.count * piecesPerPack - totalSold };
}
