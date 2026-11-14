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
export function inventoryAccessDenied(error: any): boolean {
  const errors = error?.body?.errors?.graphQLErrors ?? error?.errors;
  return Array.isArray(errors) && errors.length > 0 && errors.every(e =>
    e.extensions?.code === 'ACCESS_DENIED' && Array.isArray(e.path) &&
    (e.path.includes('inventoryLevels') || e.path.includes('inventoryItem')));
}
export interface PackVariant { id: string; size: string; group: string; sku: string; stock: number | null; demand: number }
export function minimumPacks(variants: PackVariant[], composition: string): { count: number | null; reason: string | null } {
  const recipe = COMPOSITIONS[composition];
  if (!recipe) return { count: null, reason: "Seleziona una composizione" };
  let count = 0;
  for (const variant of variants.filter(v => v.demand > 0)) {
    if (variant.stock === null) return { count: null, reason: "DA CONTARE" };
    const missing = Math.max(0, variant.demand - Math.max(0, variant.stock));
    if (missing === 0) continue;
    if (!recipe[variant.size]) return { count: null, reason: `Taglia ${variant.size || "sconosciuta"} non coperta` };
    count = Math.max(count, Math.ceil(missing / recipe[variant.size]));
  }
  return { count, reason: null };
}
