import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

// Tipo per un prodotto aggregato dagli ordini
export interface AggregatedProduct {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  displayName: string;
  totalQuantity: number;
  purchaseQuantity?: number;
  codQuantity: number;
  codAcceptedQuantity: number; // Contrassegni con tag "ACCETTATO"
}

// Tipo per un ordine COD non confermato
export interface UnconfirmedCodOrder {
  id: string;
  name: string;           // es. "#1234"
  createdAt: string;
  totalPrice: string;
  currencyCode: string;
  customerName: string;
  customerEmail: string;
  shippingCity: string;
  shippingProvince: string;
  itemCount: number;
  items: Array<{
    title: string;
    quantity: number;
  }>;
}

// Tipo per un ordine che contiene un prodotto specifico
export interface AffectedOrder {
  id: string;
  name: string;
  createdAt: string;
  customerName: string;
  quantity: number; // Quantità di QUEL prodotto in questo ordine
}

// Tipo per la risposta della query GraphQL
interface OrdersQueryResponse {
  data: {
    orders: {
      edges: Array<{
        node: {
          id: string;
          name: string;
          tags: string[];
          createdAt: string;
          paymentGatewayNames: string[];
          displayFinancialStatus: string;
          displayFulfillmentStatus: string;
          totalPriceSet?: {
            shopMoney?: {
              amount?: string;
              currencyCode?: string;
            };
          };
          lineItems: {
            edges: Array<{
              node: {
                title: string;
                variantTitle: string | null;
                currentQuantity: number;
                product: { id: string } | null;
                variant: { id: string } | null;
              };
            }>;
          };
        };
      }>;
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  };
}

// Query GraphQL per ottenere ordini non evasi
const UNFULFILLED_ORDERS_QUERY = `
  query UnfulfilledOrders($cursor: String) {
    orders(
      first: 50
      after: $cursor
      query: "created_at:>='2026-09-30T22:00:00Z' (fulfillment_status:unfulfilled OR fulfillment_status:partial) -status:cancelled -financial_status:refunded"
      sortKey: CREATED_AT
    ) {
      edges {
        node {
          id
          name
          cancelledAt
          test
          tags
          createdAt
          paymentGatewayNames
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          fulfillmentOrders(first: 50) {
            nodes { status }
            pageInfo { hasNextPage }
          }
          lineItems(first: 50) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                title
                variantTitle
                currentQuantity
                unfulfilledQuantity
                requiresShipping
                product {
                  id
                }
                variant {
                  id
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Recupera tutti gli ordini da evadere e aggrega i prodotti necessari.
 * 
 * Considera solo:
 * - Ordini pagati (PAID) o parzialmente pagati (PARTIALLY_PAID)
 * - Ordini non evasi (UNFULFILLED) o parzialmente evasi (PARTIALLY_FULFILLED)
 * 
 * Esclude:
 * - Ordini annullati
 * - Ordini completamente evasi
 * - Ordini rimborsati
 * 
 * Usa unfulfilledQuantity per escludere le quantita gia evase
 * in ordini parzialmente evasi.
 * 
 * Traccia separatamente i contrassegni con tag "ACCETTATO".
 * Raccoglie anche gli ordini COD non confermati (senza tag ACCETTATO).
 */
export async function getAggregatedProducts(
  admin: AdminApiContext
): Promise<{
  products: AggregatedProduct[];
  orderCount: number;
  codAcceptedCount: number;
  unconfirmedCodOrders: UnconfirmedCodOrder[];
  affectedOrdersMap: Record<string, AffectedOrder[]>;
}> {
  const productMap = new Map<string, AggregatedProduct>();
  const unconfirmedCodOrders: UnconfirmedCodOrder[] = [];
  const affectedOrdersMap: Record<string, AffectedOrder[]> = {};
  
  let hasNextPage = true;
  let cursor: string | null = null;
  let orderCount = 0;
  let codAcceptedCount = 0;

  // Status finanziari accettati
  const acceptedFinancialStatuses = new Set([
    "PAID",
    "PARTIALLY_PAID",
    "PARTIALLY_REFUNDED",
    "PENDING",
    "AUTHORIZED",
  ]);

  while (hasNextPage) {
    try {
      const response = (await admin.graphql(UNFULFILLED_ORDERS_QUERY, {
        variables: { cursor },
      })) as Response;

      const json = (await response.json()) as any;
      
      if (json.errors) {
        console.error("GraphQL Errors:", JSON.stringify(json.errors, null, 2));
        // Se c'è un errore, smettiamo di ciclare ma non crashiamo
        throw new Error("Lettura Shopify incompleta: aggiornare i dati");
      }

      if (!json.data || !json.data.orders) {
        console.error("GraphQL Response missing data.orders:", json);
        throw new Error("Lettura Shopify incompleta: aggiornare i dati");
      }

      const { orders } = json.data;

    for (const edge of orders.edges) {
      const order = edge.node;
      if (order.cancelledAt || order.test) continue;
      if (order.fulfillmentOrders?.pageInfo.hasNextPage) throw new Error("Conteggio evasione incompleto");
      while (order.lineItems.pageInfo?.hasNextPage) {
        const response = await admin.graphql(`query MoreOrderLines($id: ID!, $after: String!) {
          order(id: $id) { lineItems(first: 50, after: $after) {
            pageInfo { hasNextPage endCursor }
            edges { node { title variantTitle currentQuantity unfulfilledQuantity requiresShipping product { id } variant { id } } }
          } }
        }`, { variables: { id: order.id, after: order.lineItems.pageInfo.endCursor } });
        const extra: any = await response.json();
        if (extra.errors || !extra.data?.order) throw new Error("Lettura righe ordine incompleta");
        order.lineItems.edges.push(...extra.data.order.lineItems.edges);
        order.lineItems.pageInfo = extra.data.order.lineItems.pageInfo;
      }

      // Filtra solo ordini con stato finanziario accettato
      if (!acceptedFinancialStatuses.has(order.displayFinancialStatus)) {
        continue;
      }

      // Le spedizioni exchange sono servizi, non prodotti da preparare.
      // Gli ordini misti mantengono soltanto le altre righe nel conteggio.
      const productLineItems = order.lineItems.edges.filter((e: any) =>
        e.node.unfulfilledQuantity > 0 && e.node.requiresShipping &&
        !["SPEDIZIONE EXCHANGE", "PAGAMENTO ALLA CONSEGNA", "COMMISSIONE PAGAMENTO ALLA CONSEGNA"].includes(e.node.title.trim().replace(/\s+/g, " ").toUpperCase())
      );
      if (productLineItems.length === 0) continue;

      const gateways = order.paymentGatewayNames || [];
      const isCOD = gateways.some((g: string) => {
        const lower = g.toLowerCase();
        return lower.includes("cod") || lower.includes("contrassegno") || lower.includes("cash on delivery") || lower.includes("pagamento alla consegna");
      }) || (order.displayFinancialStatus === "PENDING" && gateways.length === 0); // fallback in case of no gateways but pending

      
      // Controlla se l'ordine ha il tag "ACCETTATO" (case-insensitive)
      const orderTags = order.tags || [];
      const hasAcceptedTag = orderTags.some((tag: string) => tag.toUpperCase() === "ACCETTATO");
      
      const attention = orderTags.some((tag: string) => tag.toUpperCase() === "RICHIEDE ATTENZIONE");
      const held = ["ON_HOLD", "SCHEDULED", "INCOMPLETE"].includes(order.displayFulfillmentStatus) ||
        order.fulfillmentOrders?.nodes.some((f: any) => ["ON_HOLD", "SCHEDULED", "INCOMPLETE"].includes(f.status));
      const isCodAccepted = isCOD && hasAcceptedTag && !attention && !held;
      const operational = !attention && !held && (order.displayFinancialStatus === "PAID" ||
        (order.displayFinancialStatus === "PENDING" && hasAcceptedTag));

      if (isCodAccepted) {
        codAcceptedCount++;
      }

      // Se è un COD senza tag ACCETTATO, aggiungilo alla lista "da confermare"
      if (isCOD && !hasAcceptedTag) {
        const customerName = "Cliente"; // Rimosso per limiti permessi Shopify Protected Data
        const items = productLineItems
          .map((e: any) => ({
            title: e.node.variantTitle
              ? `${e.node.title} - ${e.node.variantTitle}`
              : e.node.title,
            quantity: e.node.unfulfilledQuantity,
          }));

        const itemCount = items.reduce((sum: number, i: any) => sum + i.quantity, 0);

        unconfirmedCodOrders.push({
          id: order.id,
          name: order.name,
          createdAt: order.createdAt,
          totalPrice: order.totalPriceSet?.shopMoney?.amount || "0",
          currencyCode: order.totalPriceSet?.shopMoney?.currencyCode || "EUR",
          customerName,
          customerEmail: "",
          shippingCity: "",
          shippingProvince: "",
          itemCount,
          items,
        });
      }

      orderCount++;

      for (const lineItemEdge of productLineItems) {
        const item = lineItemEdge.node;

        // Salta items con quantità 0 (già completamente evasi)
        if (item.unfulfilledQuantity <= 0) continue;

        // Salta items senza prodotto o variante (prodotti eliminati)
        if (!item.product?.id || !item.variant?.id) continue;

        const variantId = item.variant.id;
        const productId = item.product.id;

        // Aggiungi all'affectedOrdersMap
        if (!affectedOrdersMap[variantId]) {
          affectedOrdersMap[variantId] = [];
        }
        affectedOrdersMap[variantId].push({
          id: order.id,
          name: order.name,
          createdAt: order.createdAt,
          customerName: "Cliente", // Shopify limit bypass
          quantity: item.unfulfilledQuantity,
        });

        // Costruisci il nome display combinando titolo prodotto + variante
        const displayName = item.variantTitle
          ? `${item.title} - ${item.variantTitle}`
          : item.title;

        const existing = productMap.get(variantId);
        if (existing) {
          existing.totalQuantity += item.unfulfilledQuantity;
          existing.purchaseQuantity = (existing.purchaseQuantity || 0) + (operational ? item.unfulfilledQuantity : 0);
          if (isCOD) {
            existing.codQuantity += item.unfulfilledQuantity;
          }
          if (isCodAccepted) {
            existing.codAcceptedQuantity += item.unfulfilledQuantity;
          }
        } else {
          productMap.set(variantId, {
            productId,
            variantId,
            productTitle: item.title,
            variantTitle: item.variantTitle || "",
            displayName,
            totalQuantity: item.unfulfilledQuantity,
            purchaseQuantity: operational ? item.unfulfilledQuantity : 0,
            codQuantity: isCOD ? item.unfulfilledQuantity : 0,
            codAcceptedQuantity: isCodAccepted ? item.unfulfilledQuantity : 0,
          });
        }
      }
    }

    hasNextPage = orders.pageInfo.hasNextPage;
    cursor = orders.pageInfo.endCursor;
    } catch (error) {
      console.error("Caught error in GraphQL fetch:", error);
      throw error;
    }
  }

  // Ordina per quantità decrescente
  const products = Array.from(productMap.values()).sort(
    (a, b) => b.totalQuantity - a.totalQuantity
  );

  // Ordina COD non confermati per data (più vecchi prima)
  unconfirmedCodOrders.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return { products, orderCount, codAcceptedCount, unconfirmedCodOrders, affectedOrdersMap };
}
