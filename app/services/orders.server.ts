import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

// Tipo per un prodotto aggregato dagli ordini
export interface AggregatedProduct {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  displayName: string;
  totalQuantity: number;
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
          displayFinancialStatus: string;
          displayFulfillmentStatus: string;
          totalPriceSet: {
            shopMoney: {
              amount: string;
              currencyCode: string;
            };
          };
          customer: {
            firstName: string | null;
            lastName: string | null;
            email: string | null;
          } | null;
          shippingAddress: {
            city: string | null;
            province: string | null;
          } | null;
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
      query: "fulfillment_status:unfulfilled OR fulfillment_status:partial"
      sortKey: CREATED_AT
    ) {
      edges {
        node {
          id
          name
          tags
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          customer {
            firstName
            lastName
            email
          }
          shippingAddress {
            city
            province
          }
          lineItems(first: 250) {
            edges {
              node {
                title
                variantTitle
                currentQuantity
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
 * Usa currentQuantity per tenere conto delle quantità già evase
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
}> {
  const productMap = new Map<string, AggregatedProduct>();
  const unconfirmedCodOrders: UnconfirmedCodOrder[] = [];
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
    const response = (await admin.graphql(UNFULFILLED_ORDERS_QUERY, {
      variables: { cursor },
    })) as Response;

    const json = (await response.json()) as OrdersQueryResponse;
    const { orders } = json.data;

    for (const edge of orders.edges) {
      const order = edge.node;

      // Filtra solo ordini con stato finanziario accettato
      if (!acceptedFinancialStatuses.has(order.displayFinancialStatus)) {
        continue;
      }

      const isCOD = order.displayFinancialStatus === "PENDING";
      
      // Controlla se l'ordine ha il tag "ACCETTATO" (case-insensitive)
      const hasAcceptedTag = order.tags.some(
        (tag) => tag.toUpperCase() === "ACCETTATO"
      );
      
      const isCodAccepted = isCOD && hasAcceptedTag;

      if (isCodAccepted) {
        codAcceptedCount++;
      }

      // Se è un COD senza tag ACCETTATO, aggiungilo alla lista "da confermare"
      if (isCOD && !hasAcceptedTag) {
        const customerFirstName = order.customer?.firstName || "";
        const customerLastName = order.customer?.lastName || "";
        const customerName = [customerFirstName, customerLastName]
          .filter(Boolean)
          .join(" ") || "Cliente sconosciuto";

        const items = order.lineItems.edges
          .filter((e) => e.node.currentQuantity > 0)
          .map((e) => ({
            title: e.node.variantTitle
              ? `${e.node.title} - ${e.node.variantTitle}`
              : e.node.title,
            quantity: e.node.currentQuantity,
          }));

        const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

        unconfirmedCodOrders.push({
          id: order.id,
          name: order.name,
          createdAt: order.createdAt,
          totalPrice: order.totalPriceSet.shopMoney.amount,
          currencyCode: order.totalPriceSet.shopMoney.currencyCode,
          customerName,
          customerEmail: order.customer?.email || "",
          shippingCity: order.shippingAddress?.city || "",
          shippingProvince: order.shippingAddress?.province || "",
          itemCount,
          items,
        });
      }

      orderCount++;

      for (const lineItemEdge of order.lineItems.edges) {
        const item = lineItemEdge.node;

        // Salta items con quantità 0 (già completamente evasi)
        if (item.currentQuantity <= 0) continue;

        // Salta items senza prodotto o variante (prodotti eliminati)
        if (!item.product?.id || !item.variant?.id) continue;

        const variantId = item.variant.id;
        const productId = item.product.id;

        // Costruisci il nome display combinando titolo prodotto + variante
        const displayName = item.variantTitle
          ? `${item.title} - ${item.variantTitle}`
          : item.title;

        const existing = productMap.get(variantId);
        if (existing) {
          existing.totalQuantity += item.currentQuantity;
          if (isCOD) {
            existing.codQuantity += item.currentQuantity;
          }
          if (isCodAccepted) {
            existing.codAcceptedQuantity += item.currentQuantity;
          }
        } else {
          productMap.set(variantId, {
            productId,
            variantId,
            productTitle: item.title,
            variantTitle: item.variantTitle || "",
            displayName,
            totalQuantity: item.currentQuantity,
            codQuantity: isCOD ? item.currentQuantity : 0,
            codAcceptedQuantity: isCodAccepted ? item.currentQuantity : 0,
          });
        }
      }
    }

    hasNextPage = orders.pageInfo.hasNextPage;
    cursor = orders.pageInfo.endCursor;
  }

  // Ordina per quantità decrescente
  const products = Array.from(productMap.values()).sort(
    (a, b) => b.totalQuantity - a.totalQuantity
  );

  // Ordina COD non confermati per data (più vecchi prima)
  unconfirmedCodOrders.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return { products, orderCount, codAcceptedCount, unconfirmedCodOrders };
}
