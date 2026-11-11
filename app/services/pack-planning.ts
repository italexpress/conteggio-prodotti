export const PACKS = {
  assorted: { S: 1, M: 2, L: 2, XL: 1 },
  uniform: { S: 1, M: 1, L: 1, XL: 1 },
} as const;
export type PackType = keyof typeof PACKS;
export function packOptions(hasXXL: boolean) { return [
  { label: `Assortito: S - M - M - L - L - XL${hasXXL ? ' - XXL (7 pezzi)' : ' (6 pezzi)'}`, value: 'assorted' },
  { label: `Uniforme: S - M - L - XL${hasXXL ? ' - XXL (5 pezzi)' : ' (4 pezzi)'}`, value: 'uniform' },
]; }
export function packComposition(type: PackType, hasXXL: boolean): Record<string, number> {
  if (!PACKS[type]) throw new Error('Composizione pacco non valida');
  return { ...PACKS[type], ...(hasXXL ? { XXL: 1 } : {}) };
}
export function normalizeSize(value: string) {
  const size = value.trim().toUpperCase();
  return size === '2XL' ? 'XXL' : size === '3XL' ? 'XXXL' : size;
}
export function variantGroup(title: string) {
  const parts = title.split('/').map(s => s.trim());
  const sizes = parts.filter(s => /^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|\d{2,3})$/i.test(s));
  if (sizes.length !== 1) return { size: '', color: title, colorKey: title.trim().toUpperCase() };
  const color = parts.filter(s => s !== sizes[0]).join(' / ');
  return { size: normalizeSize(sizes[0]), color, colorKey: color.toUpperCase() };
}
export function groupKey(productId: string, colorKey: string) {
  return JSON.stringify([productId, colorKey]);
}
export function planPacks(demand: Record<string, number>, incoming: Record<string, number>, packType: PackType, hasXXL = false, stock: Record<string, number> = {}) {
  const composition = packComposition(packType, hasXXL);
  const residual: Record<string, number> = {};
  for (const [size, qty] of Object.entries(demand)) residual[size] = Math.max(0, qty - (incoming[size] || 0) - (stock[size] || 0));
  const unsupported = Object.keys(residual).filter(s => residual[s] > 0 && !composition[s]);
  const packs = unsupported.length ? 0 : Math.max(0, ...Object.entries(residual).map(([s, q]) => Math.ceil(q / (composition[s] || 1))));
  const quantities = Object.fromEntries(Object.entries(composition).map(([s, q]) => [s, q * packs]));
  const excess = Object.fromEntries(Object.entries(quantities).map(([s, q]) => [s, Math.max(0, q - (residual[s] || 0))]));
  return { packs, residual, quantities, excess, unsupported };
}
