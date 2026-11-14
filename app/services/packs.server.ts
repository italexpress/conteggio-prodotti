import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "../db.server";
import type { AggregatedProduct } from "./orders.server";
import { compatibleCompositions, normalizeSize, type PackVariant } from "./packs";

export const PACK_PRODUCT_QUERY = `query PackProduct($id: ID!, $cursor: String) {
  product(id: $id) {
    id title vendor
    variants(first: 20, after: $cursor) {
      nodes {
        id sku selectedOptions { name value }
        inventoryItem { tracked inventoryLevels(first: 10) {
          nodes { quantities(names: ["on_hand"]) { name quantity } }
          pageInfo { hasNextPage }
        } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export async function getPackProduct(admin: AdminApiContext, productId: string, orders: AggregatedProduct[] = []) {
  let cursor: string | null = null;
  let product: any;
  const variants: PackVariant[] = [];
  do {
    const response = await admin.graphql(PACK_PRODUCT_QUERY, { variables: { id: productId, cursor } });
    const body = await response.json() as any;
    if (body.errors || !body.data?.product) throw new Error("Impossibile verificare taglie e giacenze Shopify");
    product = body.data.product;
    for (const v of product.variants.nodes) {
      const sizeOption = v.selectedOptions.find((o: any) => /^(size|taglia|taille|talla|größe)$/i.test(o.name));
      const group = v.selectedOptions.filter((o: any) => o !== sizeOption).map((o: any) => `${o.name}: ${o.value}`).join(" / ");
      const levels = v.inventoryItem?.inventoryLevels;
      const quantities = levels?.nodes.map((l: any) => l.quantities.find((q: any) => q.name === "on_hand")?.quantity);
      const known = v.inventoryItem?.tracked && !levels?.pageInfo.hasNextPage && quantities?.length > 0 && quantities.every((q: any) => Number.isFinite(q));
      variants.push({ id: v.id, sku: v.sku || "", size: normalizeSize(sizeOption?.value || ""), group,
        stock: known ? quantities.reduce((sum: number, n: number) => sum + n, 0) : null,
        demand: orders.find(o => o.variantId === v.id)?.packQuantity || 0 });
    }
    cursor = product.variants.pageInfo.hasNextPage ? product.variants.pageInfo.endCursor : null;
    if (product.variants.pageInfo.hasNextPage && !cursor) throw new Error("Paginazione varianti incompleta");
  } while (cursor);
  if (orders.some(o => o.productId === productId && (o.packQuantity || 0) > 0 && !variants.some(v => v.id === o.variantId))) {
    throw new Error("Una variante richiesta dagli ordini non è più presente su Shopify: verificare il prodotto");
  }
  const groups = [...new Set(variants.map(v => v.group))].map(group => {
    const rows = variants.filter(v => v.group === group);
    const sizes = rows.map(v => v.size);
    const unique = new Set(sizes).size === sizes.length;
    return { name: group, variants: rows, options: unique ? compatibleCompositions(sizes) : [] };
  });
  // Un'unica scelta per prodotto, valida per tutti i colori/gruppi effettivi.
  const options = groups.length ? groups[0].options.filter(o => groups.every(g => g.options.includes(o))) : [];
  return { id: product.id as string, title: product.title as string, vendor: product.vendor as string, groups, options };
}

export async function getPackPlan(admin: AdminApiContext, shop: string, orders: AggregatedProduct[]) {
  const settings = await prisma.productPack.findMany({ where: { shop } });
  const result = [];
  for (const id of [...new Set(orders.map(o => o.productId))]) {
    const product = await getPackProduct(admin, id, orders);
    result.push({ ...product, selected: settings.find(s => s.productId === id)?.composition || "" });
  }
  return result;
}
