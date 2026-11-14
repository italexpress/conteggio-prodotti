import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "../db.server";
import type { AggregatedProduct } from "./orders.server";
import { compatibleCompositions, normalizeSize, inventoryAccessDenied, type PackVariant } from "./packs";

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

export const PACK_METADATA_QUERY = `query PackMetadata($id: ID!, $cursor: String) {
  product(id: $id) {
    id title vendor
    variants(first: 20, after: $cursor) {
      nodes { id sku selectedOptions { name value } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
const inventoryUnavailable = new WeakSet<object>();

async function readPackPage(admin: AdminApiContext, id: string, cursor: string | null) {
  const read = async (query: string) => {
    const response = await admin.graphql(query, { variables: { id, cursor } });
    const body = await response.json() as any;
    if (body.errors) throw Object.assign(new Error('Errore query prodotto Shopify'), { errors: body.errors });
    if (!body.data?.product) throw new Error('Prodotto Shopify non disponibile');
    return body;
  };
  if (inventoryUnavailable.has(admin)) return read(PACK_METADATA_QUERY);
  try { return await read(PACK_PRODUCT_QUERY); }
  catch (error) {
    if (!inventoryAccessDenied(error)) throw error;
    inventoryUnavailable.add(admin);
    return read(PACK_METADATA_QUERY);
  }
}

export const PACK_CATALOG_QUERY = `query PackCatalog($cursor: String) {
  products(first: 20, after: $cursor, sortKey: TITLE) {
    nodes { id }
    pageInfo { hasNextPage endCursor }
  }
}`;

export async function getPackCatalogPage(admin: AdminApiContext, cursor: string | null) {
  const response = await admin.graphql(PACK_CATALOG_QUERY, { variables: { cursor } });
  const body = await response.json() as any;
  if (body.errors || !body.data?.products) throw new Error("Catalogo Shopify non disponibile");
  const { nodes, pageInfo } = body.data.products;
  if (pageInfo.hasNextPage && !pageInfo.endCursor) throw new Error("Paginazione catalogo incompleta");
  return { ids: nodes.map((n: { id: string }) => n.id) as string[], hasNextPage: Boolean(pageInfo.hasNextPage), endCursor: pageInfo.endCursor as string | null };
}

export async function getPackProduct(admin: AdminApiContext, productId: string, orders: AggregatedProduct[] = []) {
  let cursor: string | null = null;
  let product: any;
  const variants: PackVariant[] = [];
  do {
    const body = await readPackPage(admin, productId, cursor);
    product = body.data.product;
    for (const v of product.variants.nodes) {
      const sizeOption = v.selectedOptions.find((o: any) => /^(size|taglia|taglie|taille|talla|größe)$/i.test(o.name));
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

export async function getPackPlan(admin: AdminApiContext, shop: string, orders: AggregatedProduct[], productIds?: string[]) {
  const settings = await prisma.productPack.findMany({ where: { shop } });
  const result = [];
  for (const id of [...new Set(productIds ?? orders.map(o => o.productId))]) {
    const product = await getPackProduct(admin, id, orders);
    result.push({ ...product, selected: settings.find(s => s.productId === id)?.composition || "" });
  }
  return result;
}
