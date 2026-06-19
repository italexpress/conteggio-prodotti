import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { getSettings } from "./settings.server";
import { getFixedCostsTotal } from "./fixed-costs.server";

// ─── GraphQL Query ───────────────────────────────────────────────────────────

const ORDERS_QUERY = `
  query OrdersProfit($query: String!, $cursor: String, $first: Int!) {
    orders(first: $first, query: $query, after: $cursor, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          displayFinancialStatus
          tags
          paymentGatewayNames
          totalPriceSet {
            shopMoney { amount }
          }
          totalShippingPriceSet {
            shopMoney { amount }
          }
          lineItems(first: 50) {
            edges {
              node {
                quantity
                variant {
                  inventoryItem {
                    unitCost { amount }
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

// ─── Types ───────────────────────────────────────────────────────────────────

export type OrderType =
  | "standard"
  | "ritorno_merce"
  | "reso_cliente_spedisce"
  | "reso_rimborso_ritiro"
  | "reso_exchange"
  | "reso_voucher"
  | "pending";

export type PaymentMethod = "shopify_payments" | "paypal" | "contrassegno" | "unknown";

export interface OrderDetail {
  id: string;
  name: string;
  createdAt: string;
  type: OrderType;
  paymentMethod: PaymentMethod;
  revenue: number;
  productCost: number;
  paymentFees: number;
  shippingRevenue: number;
  shippingCostActual: number;
  logisticsMargin: number;
  adsAllocation: number;
  orderProfit: number;
  finalOrderProfit: number;
  tags: string[];
  status: string;
  hasFreeShipping: boolean;
}

interface PeriodStats {
  revenue: number;
  orders: number;
  netProfit: number;
  margin: number;
  adsSpend: number;
  logisticsMargin: number; // Net
  positiveLogisticsMargin: number; // Only gains
  negativeLogisticsMargin: number; // Only losses (free shipping etc)
  freeShippingCost: number;
  shippingRevenue: number;
  codRevenue: number;
}

export interface ReturnStats {
  ritornoMerce: { count: number; cost: number };
  resoClienteSpedisce: { count: number; cost: number; avgCost: number };
  resoRimborsoRitiro: { count: number; revenue: number; cost: number; netProfit: number };
  resoExchange: { count: number; revenue: number; cost: number; profit: number };
  resoVoucher: { count: number; netImpact: number };
  totalReturns: number;
  totalReturnCost: number;
  totalReturnRevenue: number;
  returnRate: number;
}

export interface LossStats {
  returnedPackagesCount: number;
  returnedPackagesCost: number;
  returnsCost: number;
  totalMoneyLost: number;
}

export interface ChartDataPoint {
  name: string;
  revenue: number;
  netProfit: number;
  logisticsMargin: number;
  returnsCount: number;
  returnedPackagesCount: number;
}

export interface ProfitStats {
  today: PeriodStats;
  thisMonth: PeriodStats;
  thisYear: PeriodStats;
  returns: ReturnStats;
  losses: LossStats;
  financials: {
    avgOrderProfit: number;
    avgOrderValue: number;
    roas: number;
    cpa: number;
    netProfitAfterFixedCosts: number;
  };
  charts: {
    daily: ChartDataPoint[];
    monthly: ChartDataPoint[];
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectPaymentMethod(gateways: string[], status: string): PaymentMethod {
  for (const g of gateways) {
    const lower = g.toLowerCase();
    if (lower.includes("paypal")) return "paypal";
    if (lower.includes("cod") || lower.includes("contrassegno") || lower.includes("cash on delivery") || lower.includes("pagamento alla consegna")) return "contrassegno";
    if (lower.includes("shopify") || lower.includes("credit") || lower.includes("card") || lower.includes("stripe")) return "shopify_payments";
  }
  // Fallback: if PENDING and no gateways, assume COD
  if (status === "PENDING" && gateways.length === 0) return "contrassegno";
  // Default to shopify_payments for paid orders with unknown gateways
  if (gateways.length > 0) return "shopify_payments";
  return "unknown";
}

function detectOrderType(tags: string[]): OrderType {
  const upper = tags.map((t: string) => t.toUpperCase().trim());
  if (upper.includes("RITORNO_MERCE")) return "ritorno_merce";
  if (upper.includes("RESO_CLIENTE_SPEDISCE")) return "reso_cliente_spedisce";
  if (upper.includes("RESO_RIMBORSO_RITIRO")) return "reso_rimborso_ritiro";
  if (upper.includes("RESO_EXCHANGE")) return "reso_exchange";
  if (upper.includes("RESO_VOUCHER")) return "reso_voucher";
  return "standard";
}

function calcPaymentFee(
  amount: number,
  method: PaymentMethod,
  settings: any
): number {
  if (method === "paypal") {
    return (amount * (settings.paypalFeePercent / 100)) + settings.paypalFeeFixed;
  }
  if (method === "shopify_payments") {
    return (amount * (settings.shopifyFeePercent / 100)) + settings.shopifyFeeFixed;
  }
  return 0; // COD = no payment fee
}

function calcLogisticsMargin(
  method: PaymentMethod,
  hasFreeShipping: boolean,
  shippingChargedToCustomer: number,
  settings: any
): { margin: number; shippingRev: number; codRev: number; freeShipCost: number } {
  const isCOD = method === "contrassegno";

  if (!isCOD && !hasFreeShipping) {
    // SCENARIO 1: Online payment, customer pays shipping
    const shippingRev = shippingChargedToCustomer > 0 ? shippingChargedToCustomer : settings.shippingRevenue;
    const feeOnShipping = calcPaymentFee(shippingRev, method, settings);
    const margin = shippingRev - feeOnShipping - settings.shippingCost;
    return { margin, shippingRev, codRev: 0, freeShipCost: 0 };
  }

  if (!isCOD && hasFreeShipping) {
    // SCENARIO 2: Online payment, free shipping (order >= threshold)
    return { margin: -settings.shippingCost, shippingRev: 0, codRev: 0, freeShipCost: settings.shippingCost };
  }

  if (isCOD && !hasFreeShipping) {
    // SCENARIO 3: COD, customer pays shipping + COD fee
    const shippingRev = shippingChargedToCustomer > 0 ? shippingChargedToCustomer : settings.shippingRevenue;
    const codRev = settings.codFeeCharged;
    const totalLogRev = shippingRev + codRev;
    const margin = totalLogRev - settings.codCost;
    return { margin, shippingRev, codRev, freeShipCost: 0 };
  }

  // SCENARIO 4: COD, free shipping (order >= threshold), customer pays only COD fee
  const codRev = settings.codFeeCharged;
  const margin = codRev - settings.codCost;
  return { margin, shippingRev: 0, codRev, freeShipCost: 0 };
}

// ─── Main Stats Function ─────────────────────────────────────────────────────

export async function getProfitStats(admin: AdminApiContext, shop: string): Promise<ProfitStats> {
  const settings = await getSettings(shop);
  const monthlyFixedCosts = await getFixedCostsTotal(shop);

  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const queryStr = `created_at:>=${startOfYear.toISOString().split("T")[0]}`;

  const stats: ProfitStats = {
    today: { revenue: 0, orders: 0, netProfit: 0, margin: 0, adsSpend: 0, logisticsMargin: 0, positiveLogisticsMargin: 0, negativeLogisticsMargin: 0, freeShippingCost: 0, shippingRevenue: 0, codRevenue: 0 },
    thisMonth: { revenue: 0, orders: 0, netProfit: 0, margin: 0, adsSpend: 0, logisticsMargin: 0, positiveLogisticsMargin: 0, negativeLogisticsMargin: 0, freeShippingCost: 0, shippingRevenue: 0, codRevenue: 0 },
    thisYear: { revenue: 0, orders: 0, netProfit: 0, margin: 0, adsSpend: 0, logisticsMargin: 0, positiveLogisticsMargin: 0, negativeLogisticsMargin: 0, freeShippingCost: 0, shippingRevenue: 0, codRevenue: 0 },
    returns: {
      ritornoMerce: { count: 0, cost: 0 },
      resoClienteSpedisce: { count: 0, cost: 0, avgCost: 0 },
      resoRimborsoRitiro: { count: 0, revenue: 0, cost: 0, netProfit: 0 },
      resoExchange: { count: 0, revenue: 0, cost: 0, profit: 0 },
      resoVoucher: { count: 0, netImpact: 0 },
      totalReturns: 0, totalReturnCost: 0, totalReturnRevenue: 0, returnRate: 0,
    },
    losses: { returnedPackagesCount: 0, returnedPackagesCost: 0, returnsCost: 0, totalMoneyLost: 0 },
    financials: { avgOrderProfit: 0, avgOrderValue: 0, roas: 0, cpa: 0, netProfitAfterFixedCosts: 0 },
    charts: { daily: [], monthly: [] },
  };

  const dailyMap = new Map<string, ChartDataPoint>();
  const monthlyMap = new Map<string, ChartDataPoint>();

  const getDayKey = (d: Date) => d.toISOString().split("T")[0];
  const getMonthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  const initDataPoint = (name: string): ChartDataPoint => ({
    name, revenue: 0, netProfit: 0, logisticsMargin: 0, returnsCount: 0, returnedPackagesCount: 0
  });

  let totalValidOrders = 0;
  let totalValidRevenue = 0;
  let totalValidProfit = 0;
  let totalOrdersCount = 0;
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    try {
      const response: any = await admin.graphql(ORDERS_QUERY, {
        variables: { query: queryStr, cursor, first: 250 },
      });
      const json: any = await response.json();
      if (json.errors || !json.data?.orders) break;

      const { orders } = json.data;

      for (const edge of orders.edges) {
        const order = edge.node;
        const amount = parseFloat(order.totalPriceSet?.shopMoney?.amount || "0");
        const shippingCharged = parseFloat(order.totalShippingPriceSet?.shopMoney?.amount || "0");
        const status = order.displayFinancialStatus;
        const tags: string[] = order.tags || [];
        const gateways: string[] = order.paymentGatewayNames || [];

        const method = detectPaymentMethod(gateways, status);
        const orderType = detectOrderType(tags);
        const hasFreeShipping = shippingCharged === 0;

        // COGS
        let cogs = 0;
        for (const le of order.lineItems.edges) {
          const uc = le.node.variant?.inventoryItem?.unitCost?.amount;
          if (uc) cogs += parseFloat(uc) * le.node.quantity;
        }

        const orderDate = new Date(order.createdAt);
        const isToday = orderDate.getDate() === now.getDate() && orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
        const isThisMonth = orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();

        totalOrdersCount++;

        const dayKey = getDayKey(orderDate);
        const monthKey = getMonthKey(orderDate);

        if (!dailyMap.has(dayKey)) dailyMap.set(dayKey, initDataPoint(dayKey));
        if (!monthlyMap.has(monthKey)) monthlyMap.set(monthKey, initDataPoint(monthKey));

        const dpDaily = dailyMap.get(dayKey)!;
        const dpMonthly = monthlyMap.get(monthKey)!;

        // ─── EXCEPTION: RITORNO_MERCE ──────────────────────────────────────
        if (orderType === "ritorno_merce") {
          // Loss = outbound shipping + COD cost + return shipping (all IVA-inclusive from settings)
          const loss = settings.shippingCost + settings.codCost + settings.returnShipmentCost;
          stats.returns.ritornoMerce.count++;
          stats.returns.ritornoMerce.cost += loss;
          stats.losses.returnedPackagesCount++;
          stats.losses.returnedPackagesCost += loss;
          stats.losses.totalMoneyLost += loss;
          stats.returns.totalReturns++;
          stats.returns.totalReturnCost += loss;

          // Subtract from period profits
          stats.thisYear.netProfit -= loss;
          if (isThisMonth) stats.thisMonth.netProfit -= loss;
          if (isToday) stats.today.netProfit -= loss;
          
          dpDaily.netProfit -= loss;
          dpDaily.returnsCount++;
          dpDaily.returnedPackagesCount++;
          dpMonthly.netProfit -= loss;
          dpMonthly.returnsCount++;
          dpMonthly.returnedPackagesCount++;
          continue;
        }

        // ─── EXCEPTION: RESO_CLIENTE_SPEDISCE ──────────────────────────────
        if (orderType === "reso_cliente_spedisce") {
          const cost = settings.resoClienteShippingCost;
          stats.returns.resoClienteSpedisce.count++;
          stats.returns.resoClienteSpedisce.cost += cost;
          stats.returns.totalReturns++;
          stats.returns.totalReturnCost += cost;
          stats.losses.returnsCost += cost;
          stats.losses.totalMoneyLost += cost;

          stats.thisYear.netProfit -= cost;
          if (isThisMonth) stats.thisMonth.netProfit -= cost;
          if (isToday) stats.today.netProfit -= cost;

          dpDaily.netProfit -= cost;
          dpDaily.returnsCount++;
          dpMonthly.netProfit -= cost;
          dpMonthly.returnsCount++;
          continue;
        }

        // ─── EXCEPTION: RESO_RIMBORSO_RITIRO ───────────────────────────────
        if (orderType === "reso_rimborso_ritiro") {
          // Customer pays 9€, company pays ~5€ collection. Fees are refunded.
          const rev = settings.resoRimborsoRevenue;
          const cost = settings.resoRimborsoCost;
          const fee = calcPaymentFee(rev, method, settings);
          const profit = rev - cost - fee;

          stats.returns.resoRimborsoRitiro.count++;
          stats.returns.resoRimborsoRitiro.revenue += rev;
          stats.returns.resoRimborsoRitiro.cost += cost;
          stats.returns.resoRimborsoRitiro.netProfit += profit;
          stats.returns.totalReturns++;
          stats.returns.totalReturnRevenue += rev;
          stats.returns.totalReturnCost += cost;

          stats.thisYear.netProfit += profit;
          if (isThisMonth) stats.thisMonth.netProfit += profit;
          if (isToday) stats.today.netProfit += profit;

          dpDaily.netProfit += profit;
          dpDaily.returnsCount++;
          dpMonthly.netProfit += profit;
          dpMonthly.returnsCount++;
          continue;
        }

        // ─── EXCEPTION: RESO_EXCHANGE ──────────────────────────────────────
        if (orderType === "reso_exchange") {
          const rev = settings.resoExchangeRevenue;
          const cost = settings.resoExchangeCost;
          const fee = calcPaymentFee(rev, method, settings);
          const profit = rev - cost - fee;

          stats.returns.resoExchange.count++;
          stats.returns.resoExchange.revenue += rev;
          stats.returns.resoExchange.cost += cost;
          stats.returns.resoExchange.profit += profit;
          stats.returns.totalReturns++;
          stats.returns.totalReturnRevenue += rev;
          stats.returns.totalReturnCost += cost;

          stats.thisYear.netProfit += profit;
          if (isThisMonth) stats.thisMonth.netProfit += profit;
          if (isToday) stats.today.netProfit += profit;

          dpDaily.netProfit += profit;
          dpDaily.returnsCount++;
          dpMonthly.netProfit += profit;
          dpMonthly.returnsCount++;
          continue;
        }

        // ─── EXCEPTION: RESO_VOUCHER ───────────────────────────────────────
        if (orderType === "reso_voucher") {
          // Voucher = no cash refund. Impact depends on whether original had free shipping.
          let netImpact: number;
          if (hasFreeShipping) {
            // Case 2: free shipping order. Impact = 0 - shippingCost - paymentFee on original
            const fee = calcPaymentFee(amount, method, settings);
            netImpact = 0 - settings.shippingCost - fee;
          } else {
            // Case 1: paid shipping order. Impact = shippingRevenue - shippingCost - paymentFee
            const fee = calcPaymentFee(amount, method, settings);
            netImpact = shippingCharged - settings.shippingCost - fee;
          }

          stats.returns.resoVoucher.count++;
          stats.returns.resoVoucher.netImpact += netImpact;
          stats.returns.totalReturns++;
          if (netImpact < 0) {
            stats.losses.returnsCost += Math.abs(netImpact);
            stats.losses.totalMoneyLost += Math.abs(netImpact);
          }

          stats.thisYear.netProfit += netImpact;
          if (isThisMonth) stats.thisMonth.netProfit += netImpact;
          if (isToday) stats.today.netProfit += netImpact;

          dpDaily.netProfit += netImpact;
          dpDaily.returnsCount++;
          dpMonthly.netProfit += netImpact;
          dpMonthly.returnsCount++;
          continue;
        }

        // ─── STANDARD ORDER ────────────────────────────────────────────────
        const hasAcceptedTag = tags.some((t: string) => t.toUpperCase().trim() === "ACCETTATO");
        const isCOD = method === "contrassegno";

        const isValid =
          status === "PAID" ||
          status === "PARTIALLY_PAID" ||
          (isCOD && hasAcceptedTag);

        if (!isValid) continue; // Skip pending/unconfirmed orders

        // Payment fees on product revenue (excluding shipping)
        const productRevenue = amount - shippingCharged;
        const paymentFees = calcPaymentFee(productRevenue, method, settings);

        // Logistics margin
        const logistics = calcLogisticsMargin(method, hasFreeShipping, shippingCharged, settings);

        // Order profit = Revenue(products only, no IVA) - COGS - Payment Fees + Logistics Margin
        const revenueExVat = productRevenue / (1 + (settings.vatPercent / 100));
        const orderProfit = revenueExVat - cogs - paymentFees + logistics.margin;

        totalValidOrders++;
        totalValidRevenue += amount;
        totalValidProfit += orderProfit;

        // Aggregate into periods
        const addToPeriod = (p: PeriodStats) => {
          p.revenue += amount;
          p.orders++;
          p.netProfit += orderProfit;
          p.logisticsMargin += logistics.margin;
          if (logistics.margin > 0) p.positiveLogisticsMargin += logistics.margin;
          if (logistics.margin < 0) p.negativeLogisticsMargin += logistics.margin;
          p.freeShippingCost += logistics.freeShipCost;
          p.shippingRevenue += logistics.shippingRev;
          p.codRevenue += logistics.codRev;
        };

        addToPeriod(stats.thisYear);
        if (isThisMonth) addToPeriod(stats.thisMonth);
        if (isToday) addToPeriod(stats.today);

        dpDaily.revenue += amount;
        dpDaily.netProfit += orderProfit;
        dpDaily.logisticsMargin += logistics.margin;

        dpMonthly.revenue += amount;
        dpMonthly.netProfit += orderProfit;
        dpMonthly.logisticsMargin += logistics.margin;
      }

      hasNextPage = orders.pageInfo.hasNextPage;
      cursor = orders.pageInfo.endCursor;
    } catch (e) {
      console.error("Error fetching profit data:", e);
      break;
    }
  }

  // Margins
  for (const p of [stats.today, stats.thisMonth, stats.thisYear]) {
    p.margin = p.revenue > 0 ? (p.netProfit / p.revenue) * 100 : 0;
  }

  // Returns
  const rc = stats.returns.resoClienteSpedisce;
  rc.avgCost = rc.count > 0 ? rc.cost / rc.count : 0;
  stats.returns.returnRate = totalOrdersCount > 0 ? (stats.returns.totalReturns / totalOrdersCount) * 100 : 0;

  // Financials
  stats.financials.avgOrderValue = totalValidOrders > 0 ? totalValidRevenue / totalValidOrders : 0;
  stats.financials.avgOrderProfit = totalValidOrders > 0 ? totalValidProfit / totalValidOrders : 0;
  stats.financials.netProfitAfterFixedCosts = stats.thisMonth.netProfit - monthlyFixedCosts;

  // Charts mapping
  const currentMonthPrefix = getMonthKey(now);
  stats.charts.daily = Array.from(dailyMap.values())
    .filter(dp => dp.name.startsWith(currentMonthPrefix))
    .sort((a, b) => a.name.localeCompare(b.name));
  stats.charts.monthly = Array.from(monthlyMap.values())
    .sort((a, b) => a.name.localeCompare(b.name));

  return stats;
}

// ─── Order Details (for the orders table page) ───────────────────────────────

export async function getOrdersDetail(
  admin: AdminApiContext,
  shop: string,
  options: { month?: number; year?: number } = {}
): Promise<{ orders: OrderDetail[]; hasNextPage: boolean }> {
  const settings = await getSettings(shop);
  const now = new Date();
  const year = options.year ?? now.getFullYear();
  const month = options.month ?? (now.getMonth() + 1);

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  const queryStr = `created_at:>=${startDate.toISOString().split("T")[0]} created_at:<=${endDate.toISOString().split("T")[0]}`;

  const result: OrderDetail[] = [];
  let hasNextPage = false;

  try {
    const response: any = await admin.graphql(ORDERS_QUERY, {
      variables: { query: queryStr, cursor: null, first: 50 },
    });
    const json: any = await response.json();
    if (json.errors || !json.data?.orders) return { orders: [], hasNextPage: false };

    const { orders } = json.data;
    hasNextPage = orders.pageInfo.hasNextPage;

    for (const edge of orders.edges) {
      const order = edge.node;
      const amount = parseFloat(order.totalPriceSet?.shopMoney?.amount || "0");
      const shippingCharged = parseFloat(order.totalShippingPriceSet?.shopMoney?.amount || "0");
      const status = order.displayFinancialStatus;
      const tags: string[] = order.tags || [];
      const gateways: string[] = order.paymentGatewayNames || [];

      const method = detectPaymentMethod(gateways, status);
      const orderType = detectOrderType(tags);
      const hasFreeShipping = shippingCharged === 0;

      let cogs = 0;
      for (const le of order.lineItems.edges) {
        const uc = le.node.variant?.inventoryItem?.unitCost?.amount;
        if (uc) cogs += parseFloat(uc) * le.node.quantity;
      }

      const base: Partial<OrderDetail> = {
        id: order.id,
        name: order.name,
        createdAt: order.createdAt,
        paymentMethod: method,
        tags,
        status,
        hasFreeShipping,
        adsAllocation: 0, // Phase 3
      };

      // ─── RITORNO_MERCE ───
      if (orderType === "ritorno_merce") {
        const loss = settings.shippingCost + settings.codCost + settings.returnShipmentCost;
        result.push({
          ...base as any,
          type: "ritorno_merce",
          revenue: 0,
          productCost: 0,
          paymentFees: 0,
          shippingRevenue: 0,
          shippingCostActual: loss,
          logisticsMargin: -loss,
          orderProfit: -loss,
          finalOrderProfit: -loss,
        });
        continue;
      }

      // ─── RESO_CLIENTE_SPEDISCE ───
      if (orderType === "reso_cliente_spedisce") {
        const cost = settings.resoClienteShippingCost;
        result.push({
          ...base as any,
          type: "reso_cliente_spedisce",
          revenue: 0,
          productCost: 0,
          paymentFees: 0,
          shippingRevenue: 0,
          shippingCostActual: cost,
          logisticsMargin: -cost,
          orderProfit: -cost,
          finalOrderProfit: -cost,
        });
        continue;
      }

      // ─── RESO_RIMBORSO_RITIRO ───
      if (orderType === "reso_rimborso_ritiro") {
        const rev = settings.resoRimborsoRevenue;
        const cost = settings.resoRimborsoCost;
        const fee = calcPaymentFee(rev, method, settings);
        const profit = rev - cost - fee;
        result.push({
          ...base as any,
          type: "reso_rimborso_ritiro",
          revenue: rev,
          productCost: 0,
          paymentFees: fee,
          shippingRevenue: 0,
          shippingCostActual: cost,
          logisticsMargin: 0,
          orderProfit: profit,
          finalOrderProfit: profit,
        });
        continue;
      }

      // ─── RESO_EXCHANGE ───
      if (orderType === "reso_exchange") {
        const rev = settings.resoExchangeRevenue;
        const cost = settings.resoExchangeCost;
        const fee = calcPaymentFee(rev, method, settings);
        const profit = rev - cost - fee;
        result.push({
          ...base as any,
          type: "reso_exchange",
          revenue: rev,
          productCost: 0,
          paymentFees: fee,
          shippingRevenue: 0,
          shippingCostActual: cost,
          logisticsMargin: 0,
          orderProfit: profit,
          finalOrderProfit: profit,
        });
        continue;
      }

      // ─── RESO_VOUCHER ───
      if (orderType === "reso_voucher") {
        const fee = calcPaymentFee(amount, method, settings);
        let netImpact: number;
        if (hasFreeShipping) {
          netImpact = 0 - settings.shippingCost - fee;
        } else {
          netImpact = shippingCharged - settings.shippingCost - fee;
        }
        result.push({
          ...base as any,
          type: "reso_voucher",
          revenue: hasFreeShipping ? 0 : shippingCharged,
          productCost: 0,
          paymentFees: fee,
          shippingRevenue: hasFreeShipping ? 0 : shippingCharged,
          shippingCostActual: settings.shippingCost,
          logisticsMargin: netImpact,
          orderProfit: netImpact,
          finalOrderProfit: netImpact,
        });
        continue;
      }

      // ─── STANDARD ORDER ───
      const hasAcceptedTag = tags.some((t: string) => t.toUpperCase().trim() === "ACCETTATO");
      const isCOD = method === "contrassegno";
      const isValid = status === "PAID" || status === "PARTIALLY_PAID" || (isCOD && hasAcceptedTag);

      if (!isValid) {
        result.push({
          ...base as any,
          type: "pending",
          revenue: amount,
          productCost: cogs,
          paymentFees: 0,
          shippingRevenue: shippingCharged,
          shippingCostActual: 0,
          logisticsMargin: 0,
          orderProfit: 0,
          finalOrderProfit: 0,
        });
        continue;
      }

      const productRevenue = amount - shippingCharged;
      const paymentFees = calcPaymentFee(productRevenue, method, settings);
      const logistics = calcLogisticsMargin(method, hasFreeShipping, shippingCharged, settings);
      const revenueExVat = productRevenue / (1 + (settings.vatPercent / 100));
      const orderProfit = revenueExVat - cogs - paymentFees + logistics.margin;

      result.push({
        ...base as any,
        type: "standard",
        revenue: amount,
        productCost: cogs,
        paymentFees,
        shippingRevenue: logistics.shippingRev,
        shippingCostActual: settings.shippingCost,
        logisticsMargin: logistics.margin,
        orderProfit,
        finalOrderProfit: orderProfit, // ads allocation added in Phase 3
      });
    }
  } catch (e) {
    console.error("Error fetching order details:", e);
  }

  return { orders: result, hasNextPage };
}
