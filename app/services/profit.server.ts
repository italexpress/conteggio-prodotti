import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { getSettings } from "./settings.server";
import { getFixedCostsTotal } from "./fixed-costs.server";

const ORDERS_PROFIT_QUERY = `
  query OrdersProfit($query: String!, $cursor: String) {
    orders(first: 250, query: $query, after: $cursor) {
      edges {
        node {
          id
          createdAt
          displayFinancialStatus
          tags
          paymentGatewayNames
          totalPriceSet {
            shopMoney {
              amount
            }
          }
          lineItems(first: 50) {
            edges {
              node {
                quantity
                variant {
                  inventoryItem {
                    unitCost {
                      amount
                    }
                  }
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

export interface ProfitStats {
  today: { revenue: number; orders: number; netProfit: number; margin: number };
  thisMonth: { revenue: number; orders: number; netProfit: number; margin: number };
  thisYear: { revenue: number; orders: number; netProfit: number; margin: number };
  
  problems: {
    refusedOrdersCount: number;
    refusedOrdersCost: number;
    returnsRefundCount: number;
    returnsRefundCost: number;
    returnsExchangeCount: number;
    returnsExchangeProfit: number;
  };
  
  financials: {
    averageOrderProfit: number;
    averageOrderValue: number;
    netProfitAfterFixedCosts: number;
  };
}

export async function getProfitStats(admin: AdminApiContext, shop: string): Promise<ProfitStats> {
  const settings = await getSettings(shop);
  const monthlyFixedCosts = await getFixedCostsTotal(shop);
  
  let hasNextPage = true;
  let cursor: string | null = null;
  
  const stats = {
    today: { revenue: 0, orders: 0, netProfit: 0, margin: 0 },
    thisMonth: { revenue: 0, orders: 0, netProfit: 0, margin: 0 },
    thisYear: { revenue: 0, orders: 0, netProfit: 0, margin: 0 },
    problems: {
      refusedOrdersCount: 0,
      refusedOrdersCost: 0,
      returnsRefundCount: 0,
      returnsRefundCost: 0,
      returnsExchangeCount: 0,
      returnsExchangeProfit: 0,
    },
    financials: {
      averageOrderProfit: 0,
      averageOrderValue: 0,
      netProfitAfterFixedCosts: 0,
    }
  };

  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const startOfYearISO = startOfYear.toISOString().split("T")[0];

  const queryStr = `created_at:>=${startOfYearISO}`;

  let totalValidOrders = 0;
  let totalValidRevenue = 0;
  let totalValidProfit = 0;

  while (hasNextPage) {
    try {
      const response: any = await admin.graphql(ORDERS_PROFIT_QUERY, {
        variables: { query: queryStr, cursor },
      });
      const json: any = await response.json();

      if (json.errors) {
        console.error("GraphQL Errors in Profit:", json.errors);
        break;
      }

      if (!json.data || !json.data.orders) {
        break;
      }

      const { orders } = json.data;

      for (const edge of orders.edges) {
        const order = edge.node;
        const amount = parseFloat(order.totalPriceSet?.shopMoney?.amount || "0");
        const status = order.displayFinancialStatus;
        const tags = order.tags || [];
        const gateways = order.paymentGatewayNames || [];
        
        // Calcolo Costo Prodotti
        let cogs = 0;
        for (const lineEdge of order.lineItems.edges) {
          const item = lineEdge.node;
          const unitCostStr = item.variant?.inventoryItem?.unitCost?.amount;
          if (unitCostStr) {
            cogs += parseFloat(unitCostStr) * item.quantity;
          }
        }
        
        const isCOD = gateways.some((g: string) => {
          const lower = g.toLowerCase();
          return lower.includes("cod") || lower.includes("contrassegno") || lower.includes("cash on delivery") || lower.includes("pagamento alla consegna");
        }) || (status === "PENDING" && gateways.length === 0);

        const hasAcceptedTag = tags.some((tag: string) => tag.toUpperCase() === "ACCETTATO");
        const hasRefusedTag = tags.some((tag: string) => tag.toUpperCase() === "COD_RIFIUTATO");
        const hasReturnRefund = tags.some((tag: string) => tag.toUpperCase() === "RESO_RIMBORSO");
        const hasReturnExchange = tags.some((tag: string) => tag.toUpperCase() === "RESO_CAMBIO");

        const orderDate = new Date(order.createdAt);
        const isToday = orderDate.getDate() === now.getDate() && orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
        const isThisMonth = orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
        const isThisYear = orderDate.getFullYear() === now.getFullYear();

        // --- CALCOLO COSTI RIFIUTI ---
        if (hasRefusedTag) {
          const refusalCost = settings.shippingCostOutbound + settings.codManagementFee + settings.shippingCostReturn;
          
          // Li conteggiamo tutti come "problemi storici" o potremmo filtrare per mese/oggi
          // Per semplicità, aggiungiamo ai totali "thisYear"
          if (isThisYear) {
            stats.problems.refusedOrdersCount++;
            stats.problems.refusedOrdersCost += refusalCost;
            
            // Sottraiamo il costo del rifiuto dal profitto globale
            stats.thisYear.netProfit -= refusalCost;
            if (isThisMonth) stats.thisMonth.netProfit -= refusalCost;
            if (isToday) stats.today.netProfit -= refusalCost;
          }
          continue; // Ordine rifiutato, stop
        }

        // --- CALCOLO COSTI RESI ---
        if (hasReturnRefund) {
          const refundImpact = settings.returnRefundRevenue - settings.returnRefundCost;
          if (isThisYear) {
            stats.problems.returnsRefundCount++;
            stats.problems.returnsRefundCost -= refundImpact; // se l'impatto è positivo, il costo scende, altrimenti sale
            
            stats.thisYear.netProfit += refundImpact;
            if (isThisMonth) stats.thisMonth.netProfit += refundImpact;
            if (isToday) stats.today.netProfit += refundImpact;
          }
          continue; // Ordine reso rimborsato, stop (assumiamo non abbia prodotto la revenue originaria)
        }

        if (hasReturnExchange) {
          const exchangeProfit = settings.returnExchangeRevenue - settings.returnExchangeCost;
          if (isThisYear) {
            stats.problems.returnsExchangeCount++;
            stats.problems.returnsExchangeProfit += exchangeProfit;
            
            // Un cambio mantiene la vendita originaria valida + profitto extra del cambio
            stats.thisYear.netProfit += exchangeProfit;
            if (isThisMonth) stats.thisMonth.netProfit += exchangeProfit;
            if (isToday) stats.today.netProfit += exchangeProfit;
          }
          // Non facciamo continue, l'ordine originale è ancora valido
        }

        // --- CALCOLO ORDINE VALIDO ---
        const isValid = 
          status === "PAID" || 
          status === "PARTIALLY_PAID" ||
          (isCOD && hasAcceptedTag);

        if (isValid) {
          // Calcolo Fees
          const hasPaypal = gateways.some((g: string) => g.toLowerCase().includes("paypal"));
          let paymentFee = 0;
          if (hasPaypal) {
            paymentFee = (amount * (settings.paypalFeePercent / 100)) + settings.paypalFeeFixed;
          } else if (!isCOD) { // Assumiamo Shopify Payments per altri metodi online
            paymentFee = (amount * (settings.shopifyFeePercent / 100)) + settings.shopifyFeeFixed;
          }

          // Rimuoviamo IVA (scorporo dal totale lordo per avere netto ricavi)
          // Se amount include IVA: Netto = amount / (1 + (VAT/100))
          const revenueSenzaIva = amount / (1 + (settings.vatPercent / 100));

          // Profitto netto ordine
          const orderProfit = revenueSenzaIva - cogs - settings.defaultShippingCost - paymentFee;

          totalValidOrders++;
          totalValidRevenue += amount;
          totalValidProfit += orderProfit;

          if (isThisYear) {
            stats.thisYear.revenue += amount;
            stats.thisYear.orders++;
            stats.thisYear.netProfit += orderProfit;
            
            if (isThisMonth) {
              stats.thisMonth.revenue += amount;
              stats.thisMonth.orders++;
              stats.thisMonth.netProfit += orderProfit;
              
              if (isToday) {
                stats.today.revenue += amount;
                stats.today.orders++;
                stats.today.netProfit += orderProfit;
              }
            }
          }
        }
      }

      hasNextPage = orders.pageInfo.hasNextPage;
      cursor = orders.pageInfo.endCursor;
    } catch (e) {
      console.error("Error fetching profit data:", e);
      break;
    }
  }

  // Calcolo margini
  stats.today.margin = stats.today.revenue > 0 ? (stats.today.netProfit / stats.today.revenue) * 100 : 0;
  stats.thisMonth.margin = stats.thisMonth.revenue > 0 ? (stats.thisMonth.netProfit / stats.thisMonth.revenue) * 100 : 0;
  stats.thisYear.margin = stats.thisYear.revenue > 0 ? (stats.thisYear.netProfit / stats.thisYear.revenue) * 100 : 0;

  // Calcoli finanziari
  stats.financials.averageOrderValue = totalValidOrders > 0 ? totalValidRevenue / totalValidOrders : 0;
  stats.financials.averageOrderProfit = totalValidOrders > 0 ? totalValidProfit / totalValidOrders : 0;
  
  // Il profitto netto dopo costi fissi viene calcolato prendendo il profitto mensile e sottraendo i costi fissi mensili
  // (Nota: per maggiore precisione si dovrebbero ripartire i costi fissi giornalmente, ma il piano richiede un calcolo generale)
  stats.financials.netProfitAfterFixedCosts = stats.thisMonth.netProfit - monthlyFixedCosts;

  return stats;
}

// --- FASE 2: Dettaglio Ordini ---

export interface OrderDetail {
  id: string;
  name: string;
  createdAt: string;
  revenue: number;
  cogs: number;
  shippingCost: number;
  paymentFee: number;
  netProfit: number;
  margin: number;
  status: string;
  tags: string[];
  gateway: string;
  type: "valid" | "cod_refused" | "return_refund" | "return_exchange" | "pending";
}

const ORDERS_DETAIL_QUERY = `
  query OrdersDetail($query: String!, $cursor: String) {
    orders(first: 50, query: $query, after: $cursor, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          displayFinancialStatus
          tags
          paymentGatewayNames
          totalPriceSet {
            shopMoney {
              amount
            }
          }
          lineItems(first: 50) {
            edges {
              node {
                quantity
                variant {
                  inventoryItem {
                    unitCost {
                      amount
                    }
                  }
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

export async function getOrdersDetail(
  admin: AdminApiContext,
  shop: string,
  options: { month?: number; year?: number; page?: number } = {}
): Promise<{ orders: OrderDetail[]; hasNextPage: boolean; endCursor: string | null }> {
  const settings = await getSettings(shop);

  const now = new Date();
  const year = options.year ?? now.getFullYear();
  const month = options.month ?? (now.getMonth() + 1); // 1-indexed

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59); // last day of month

  const startISO = startDate.toISOString().split("T")[0];
  const endISO = endDate.toISOString().split("T")[0];

  const queryStr = `created_at:>=${startISO} created_at:<=${endISO}`;

  const result: OrderDetail[] = [];
  let hasNextPage = false;
  let endCursor: string | null = null;

  // For the orders detail page we only fetch one page of 50 at a time
  try {
    const response: any = await admin.graphql(ORDERS_DETAIL_QUERY, {
      variables: { query: queryStr, cursor: null },
    });
    const json: any = await response.json();

    if (json.errors) {
      console.error("GraphQL Errors in OrdersDetail:", json.errors);
      return { orders: [], hasNextPage: false, endCursor: null };
    }

    if (!json.data?.orders) {
      return { orders: [], hasNextPage: false, endCursor: null };
    }

    const { orders } = json.data;
    hasNextPage = orders.pageInfo.hasNextPage;
    endCursor = orders.pageInfo.endCursor;

    for (const edge of orders.edges) {
      const order = edge.node;
      const amount = parseFloat(order.totalPriceSet?.shopMoney?.amount || "0");
      const status = order.displayFinancialStatus;
      const tags: string[] = order.tags || [];
      const gateways: string[] = order.paymentGatewayNames || [];

      // COGS
      let cogs = 0;
      for (const lineEdge of order.lineItems.edges) {
        const item = lineEdge.node;
        const unitCostStr = item.variant?.inventoryItem?.unitCost?.amount;
        if (unitCostStr) {
          cogs += parseFloat(unitCostStr) * item.quantity;
        }
      }

      const isCOD = gateways.some((g: string) => {
        const lower = g.toLowerCase();
        return lower.includes("cod") || lower.includes("contrassegno") || lower.includes("cash on delivery") || lower.includes("pagamento alla consegna");
      }) || (status === "PENDING" && gateways.length === 0);

      const hasAcceptedTag = tags.some((t: string) => t.toUpperCase() === "ACCETTATO");
      const hasRefusedTag = tags.some((t: string) => t.toUpperCase() === "COD_RIFIUTATO");
      const hasReturnRefund = tags.some((t: string) => t.toUpperCase() === "RESO_RIMBORSO");
      const hasReturnExchange = tags.some((t: string) => t.toUpperCase() === "RESO_CAMBIO");

      const gatewayDisplay = gateways.length > 0 ? gateways[0] : (isCOD ? "COD" : "N/A");

      // Refused
      if (hasRefusedTag) {
        const refusalCost = settings.shippingCostOutbound + settings.codManagementFee + settings.shippingCostReturn;
        result.push({
          id: order.id,
          name: order.name,
          createdAt: order.createdAt,
          revenue: 0,
          cogs: 0,
          shippingCost: refusalCost,
          paymentFee: 0,
          netProfit: -refusalCost,
          margin: -100,
          status,
          tags,
          gateway: gatewayDisplay,
          type: "cod_refused",
        });
        continue;
      }

      // Return refund
      if (hasReturnRefund) {
        const refundImpact = settings.returnRefundRevenue - settings.returnRefundCost;
        result.push({
          id: order.id,
          name: order.name,
          createdAt: order.createdAt,
          revenue: settings.returnRefundRevenue,
          cogs: 0,
          shippingCost: settings.returnRefundCost,
          paymentFee: 0,
          netProfit: refundImpact,
          margin: settings.returnRefundRevenue > 0 ? (refundImpact / settings.returnRefundRevenue) * 100 : 0,
          status,
          tags,
          gateway: gatewayDisplay,
          type: "return_refund",
        });
        continue;
      }

      // Valid or pending
      const isValid =
        status === "PAID" ||
        status === "PARTIALLY_PAID" ||
        (isCOD && hasAcceptedTag);

      if (isValid) {
        const hasPaypal = gateways.some((g: string) => g.toLowerCase().includes("paypal"));
        let paymentFee = 0;
        if (hasPaypal) {
          paymentFee = (amount * (settings.paypalFeePercent / 100)) + settings.paypalFeeFixed;
        } else if (!isCOD) {
          paymentFee = (amount * (settings.shopifyFeePercent / 100)) + settings.shopifyFeeFixed;
        }

        const revenueSenzaIva = amount / (1 + (settings.vatPercent / 100));
        const shippingCost = settings.defaultShippingCost;
        let orderProfit = revenueSenzaIva - cogs - shippingCost - paymentFee;

        // If it also has return exchange tag, add that profit
        if (hasReturnExchange) {
          const exchangeProfit = settings.returnExchangeRevenue - settings.returnExchangeCost;
          orderProfit += exchangeProfit;
        }

        result.push({
          id: order.id,
          name: order.name,
          createdAt: order.createdAt,
          revenue: amount,
          cogs,
          shippingCost,
          paymentFee,
          netProfit: orderProfit,
          margin: amount > 0 ? (orderProfit / amount) * 100 : 0,
          status,
          tags,
          gateway: gatewayDisplay,
          type: hasReturnExchange ? "return_exchange" : "valid",
        });
      } else {
        // Pending / not yet valid
        result.push({
          id: order.id,
          name: order.name,
          createdAt: order.createdAt,
          revenue: amount,
          cogs,
          shippingCost: 0,
          paymentFee: 0,
          netProfit: 0,
          margin: 0,
          status,
          tags,
          gateway: gatewayDisplay,
          type: "pending",
        });
      }
    }
  } catch (e) {
    console.error("Error fetching order details:", e);
  }

  return { orders: result, hasNextPage, endCursor };
}
