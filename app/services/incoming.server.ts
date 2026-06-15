import db from "../db.server";

// Tipo per la merce in arrivo
export interface IncomingProductData {
  id: string;
  shop: string;
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  displayName: string;
  quantity: number;
  expectedArrivalDate: string | null;
  createdAt: string;
}

/**
 * Ottieni tutta la merce in arrivo per uno shop
 */
export async function getIncomingProducts(
  shop: string
): Promise<IncomingProductData[]> {
  const items = await db.incomingProduct.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });

  return items.map((item) => ({
    id: item.id,
    shop: item.shop,
    productId: item.productId,
    variantId: item.variantId,
    productTitle: item.productTitle,
    variantTitle: item.variantTitle,
    displayName: item.displayName,
    quantity: item.quantity,
    expectedArrivalDate: item.expectedArrivalDate
      ? item.expectedArrivalDate.toISOString().split("T")[0]
      : null,
    createdAt: item.createdAt.toISOString(),
  }));
}

/**
 * Ottieni le quantità in arrivo aggregate per variantId
 */
export async function getAggregatedIncoming(
  shop: string
): Promise<Map<string, { displayName: string; totalQuantity: number }>> {
  const items = await db.incomingProduct.findMany({
    where: { shop },
  });

  const map = new Map<string, { displayName: string; totalQuantity: number }>();

  for (const item of items) {
    const existing = map.get(item.variantId);
    if (existing) {
      existing.totalQuantity += item.quantity;
    } else {
      map.set(item.variantId, {
        displayName: item.displayName,
        totalQuantity: item.quantity,
      });
    }
  }

  return map;
}

/**
 * Aggiungi un nuovo prodotto in arrivo
 */
export async function addIncomingProduct(data: {
  shop: string;
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  displayName: string;
  quantity: number;
  expectedArrivalDate?: string;
}) {
  return db.incomingProduct.create({
    data: {
      shop: data.shop,
      productId: data.productId,
      variantId: data.variantId,
      productTitle: data.productTitle,
      variantTitle: data.variantTitle,
      displayName: data.displayName,
      quantity: data.quantity,
      expectedArrivalDate: data.expectedArrivalDate
        ? new Date(data.expectedArrivalDate)
        : null,
    },
  });
}

/**
 * Elimina un prodotto in arrivo
 */
export async function deleteIncomingProduct(id: string, shop: string) {
  return db.incomingProduct.delete({
    where: { id, shop },
  });
}

/**
 * Elimina tutti i prodotti in arrivo per uno shop (usato su app/uninstalled)
 */
export async function deleteAllIncomingProducts(shop: string) {
  return db.incomingProduct.deleteMany({
    where: { shop },
  });
}
