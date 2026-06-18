import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

const ORDERS_REPORT_QUERY = `
  query OrdersReport($query: String!, $cursor: String) {
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
              currencyCode
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

export interface RevenueStats {
  today: number;
  thisMonth: number;
  thisYear: number;
  totalOrdersToday: number;
  totalOrdersMonth: number;
  totalOrdersYear: number;
}

export async function getRevenueStats(admin: AdminApiContext): Promise<RevenueStats> {
  let hasNextPage = true;
  let cursor: string | null = null;
  
  const stats: RevenueStats = {
    today: 0,
    thisMonth: 0,
    thisYear: 0,
    totalOrdersToday: 0,
    totalOrdersMonth: 0,
    totalOrdersYear: 0,
  };

  const now = new Date();
  // Calcoliamo la data di inizio anno
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const startOfYearISO = startOfYear.toISOString().split("T")[0];

  // Filtriamo solo gli ordini creati a partire dall'inizio di quest'anno
  // Questo velocizza la query rispetto a scaricare tutti gli ordini da sempre
  const queryStr = `created_at:>=${startOfYearISO}`;

  while (hasNextPage) {
    try {
      const response: any = await admin.graphql(ORDERS_REPORT_QUERY, {
        variables: { query: queryStr, cursor },
      });
      const json: any = await response.json();

      if (json.errors) {
        console.error("GraphQL Errors in Report:", json.errors);
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
        
        const isCOD = gateways.some((g: string) => {
          const lower = g.toLowerCase();
          return lower.includes("cod") || lower.includes("contrassegno") || lower.includes("cash on delivery") || lower.includes("pagamento alla consegna");
        }) || (status === "PENDING" && gateways.length === 0);

        const hasAcceptedTag = tags.some((tag: string) => tag.toUpperCase() === "ACCETTATO");

        // Considera valido se è PAGATO o se è COD ed è ACCETTATO
        const isValid = 
          status === "PAID" || 
          status === "PARTIALLY_PAID" ||
          (isCOD && hasAcceptedTag);

        if (!isValid) continue;

        const orderDate = new Date(order.createdAt);
        
        if (orderDate.getFullYear() === now.getFullYear()) {
          stats.thisYear += amount;
          stats.totalOrdersYear++;
          
          if (orderDate.getMonth() === now.getMonth()) {
            stats.thisMonth += amount;
            stats.totalOrdersMonth++;
            
            if (orderDate.getDate() === now.getDate()) {
              stats.today += amount;
              stats.totalOrdersToday++;
            }
          }
        }
      }

      hasNextPage = orders.pageInfo.hasNextPage;
      cursor = orders.pageInfo.endCursor;
    } catch (e) {
      console.error("Error fetching report data:", e);
      break;
    }
  }

  return stats;
}
