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
