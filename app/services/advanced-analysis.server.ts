import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { getSettings } from "./settings.server";
import { getFixedCostsTotal } from "./fixed-costs.server";

// ─── Query ───────────────────────────────────────────────────────────────────

const ORDERS_QUERY = `
  query OrdersAnalysis($query: String!, $cursor: String, $first: Int!) {
    orders(first: $first, query: $query, after: $cursor, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          displayFinancialStatus
          tags
          paymentGatewayNames
          customer {
            firstName
            lastName
          }
          totalPriceSet {
            shopMoney { amount }
          }
          totalShippingPriceSet {
            shopMoney { amount }
          }
          lineItems(first: 10) {
            edges {
              node {
                quantity
                title
                variant {
                  title
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

export interface LineItemDetail {
  title: string;
  variantTitle: string;
  quantity: number;
  unitCost: number;
}

export interface AdvancedOrderData {
  id: string;
  name: string;
  createdAt: string;
  customerName: string;
  type: OrderType;
  paymentMethod: PaymentMethod;
  status: string;
  tags: string[];
  
  revenue: number; // What the customer paid total
  productCost: number;
  shippingRevenue: number;
  shippingCostActual: number;
  paymentFees: number;
  logisticsMargin: number;
  adsAllocation: number;
  
  returnCosts: number;
  orderProfit: number;
  finalOrderProfit: number; // orderProfit - adsAllocation
  lossReason?: string;

  lineItems: LineItemDetail[];
}

export interface AnalysisPeriod {
  period: string; // date string, month string, or year string
  revenue: number;
  orders: number;
  adsSpend: number;
  logisticsMargin: number;
  netProfit: number;
  profitMargin: number;
  returnsCost: number;
  returnedPackageCost: number;
}

export interface CashFlowData {
  revenueCollected: number;
  pendingCodRevenue: number;
  returnedOrdersValue: number;
  refundsIssued: number;
  voucherValueIssued: number;
  estimatedAvailableCash: number;
  netCashPosition: number;
}

export interface AdvancedAnalysisResult {
  orders: AdvancedOrderData[];
  dailyAnalysis: AnalysisPeriod[];
  monthlyAnalysis: AnalysisPeriod[];
  yearlyAnalysis: AnalysisPeriod[];
  paymentMethodAnalysis: {
    method: string;
    ordersCount: number;
    revenue: number;
    fees: number;
    profit: number;
    avgProfit: number;
  }[];
  returnsAnalysis: {
    type: string;
    count: number;
    revenue: number;
    cost: number;
    netResult: number;
    avgImpact: number;
  }[];
  topOrders: AdvancedOrderData[];
  worstOrders: AdvancedOrderData[];
  cashFlow: CashFlowData;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectPaymentMethod(gateways: string[], status: string): PaymentMethod {
  for (const g of gateways) {
    const lower = g.toLowerCase();
    if (lower.includes("paypal")) return "paypal";
    if (lower.includes("cod") || lower.includes("contrassegno") || lower.includes("cash") || lower.includes("pagamento alla consegna")) return "contrassegno";
    if (lower.includes("shopify") || lower.includes("credit") || lower.includes("card") || lower.includes("stripe")) return "shopify_payments";
  }
  if (status === "PENDING" && gateways.length === 0) return "contrassegno";
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

function calcPaymentFee(amount: number, method: PaymentMethod, settings: any): number {
  if (method === "paypal") return (amount * (settings.paypalFeePercent / 100)) + settings.paypalFeeFixed;
  if (method === "shopify_payments") return (amount * (settings.shopifyFeePercent / 100)) + settings.shopifyFeeFixed;
  return 0; 
}

function calcLogisticsMargin(
  method: PaymentMethod,
  hasFreeShipping: boolean,
  shippingChargedToCustomer: number,
  settings: any
) {
  const isCOD = method === "contrassegno";

  if (!isCOD && !hasFreeShipping) {
    const shippingRev = shippingChargedToCustomer > 0 ? shippingChargedToCustomer : settings.shippingRevenue;
    const feeOnShipping = calcPaymentFee(shippingRev, method, settings);
    const margin = shippingRev - feeOnShipping - settings.shippingCost;
    return { margin, shippingRev, freeShipCost: 0 };
  }

  if (!isCOD && hasFreeShipping) {
    return { margin: -settings.shippingCost, shippingRev: 0, freeShipCost: settings.shippingCost };
  }

  if (isCOD && !hasFreeShipping) {
    const shippingRev = shippingChargedToCustomer > 0 ? shippingChargedToCustomer : settings.shippingRevenue;
    const codRev = settings.codFeeCharged;
    const margin = (shippingRev + codRev) - settings.codCost;
    return { margin, shippingRev: shippingRev + codRev, freeShipCost: 0 };
  }

  // isCOD && hasFreeShipping
  const codRev = settings.codFeeCharged;
  const margin = codRev - settings.codCost;
  return { margin, shippingRev: codRev, freeShipCost: 0 };
}

// ─── Main Engine ─────────────────────────────────────────────────────────────

export async function getAdvancedAnalysis(
  admin: AdminApiContext,
  shop: string,
  options: { startDate?: string; endDate?: string } = {}
): Promise<AdvancedAnalysisResult> {
  const settings = await getSettings(shop);
  const fixedCosts = await getFixedCostsTotal(shop);

  const start = options.startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0];
  const end = options.endDate || new Date().toISOString().split("T")[0];
  const queryStr = `created_at:>=${start} created_at:<=${end}`;

  const orders: AdvancedOrderData[] = [];
  
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    try {
      const response: any = await admin.graphql(ORDERS_QUERY, {
        variables: { query: queryStr, cursor, first: 50 },
      });
      const json: any = await response.json();
      if (json.errors || !json.data?.orders) break;

      const { orders: rawOrders } = json.data;

    for (const edge of rawOrders.edges) {
      const order = edge.node;
      const amount = parseFloat(order.totalPriceSet?.shopMoney?.amount || "0");
      const shippingCharged = parseFloat(order.totalShippingPriceSet?.shopMoney?.amount || "0");
      const status = order.displayFinancialStatus;
      const tags: string[] = order.tags || [];
      const gateways: string[] = order.paymentGatewayNames || [];

      const method = detectPaymentMethod(gateways, status);
      const orderType = detectOrderType(tags);
      const hasFreeShipping = shippingCharged === 0;

      const customerName = order.customer ? `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim() : "Guest";

      let cogs = 0;
      const lineItems: LineItemDetail[] = [];
      for (const le of order.lineItems.edges) {
        const uc = parseFloat(le.node.variant?.inventoryItem?.unitCost?.amount || "0");
        const qty = le.node.quantity;
        cogs += uc * qty;
        lineItems.push({
          title: le.node.title,
          variantTitle: le.node.variant?.title || "",
          quantity: qty,
          unitCost: uc,
        });
      }

      const base: Partial<AdvancedOrderData> = {
        id: order.id,
        name: order.name,
        createdAt: order.createdAt,
        customerName,
        type: orderType,
        paymentMethod: method,
        status,
        tags,
        lineItems,
        adsAllocation: 0,
      };

      // Excezioni
      if (orderType === "ritorno_merce") {
        const loss = settings.shippingCost + settings.codCost + settings.returnShipmentCost;
        orders.push({
          ...(base as AdvancedOrderData),
          revenue: 0, productCost: 0, shippingRevenue: 0, paymentFees: 0,
          shippingCostActual: loss, logisticsMargin: -loss, returnCosts: loss,
          orderProfit: -loss, finalOrderProfit: -loss,
          lossReason: "Ritorno Merce",
        });
        continue;
      }

      if (orderType === "reso_cliente_spedisce") {
        const cost = settings.resoClienteShippingCost;
        orders.push({
          ...(base as AdvancedOrderData),
          revenue: 0, productCost: 0, shippingRevenue: 0, paymentFees: 0,
          shippingCostActual: cost, logisticsMargin: -cost, returnCosts: cost,
          orderProfit: -cost, finalOrderProfit: -cost,
          lossReason: "Reso Cliente Spedisce",
        });
        continue;
      }

      if (orderType === "reso_rimborso_ritiro") {
        const rev = settings.resoRimborsoRevenue;
        const cost = settings.resoRimborsoCost;
        const fee = calcPaymentFee(rev, method, settings);
        const profit = rev - cost - fee;
        orders.push({
          ...(base as AdvancedOrderData),
          revenue: rev, productCost: 0, shippingRevenue: 0, paymentFees: fee,
          shippingCostActual: cost, logisticsMargin: 0, returnCosts: cost,
          orderProfit: profit, finalOrderProfit: profit,
        });
        continue;
      }

      if (orderType === "reso_exchange") {
        const rev = settings.resoExchangeRevenue;
        const cost = settings.resoExchangeCost;
        const fee = calcPaymentFee(rev, method, settings);
        const profit = rev - cost - fee;
        orders.push({
          ...(base as AdvancedOrderData),
          revenue: rev, productCost: 0, shippingRevenue: 0, paymentFees: fee,
          shippingCostActual: cost, logisticsMargin: 0, returnCosts: cost,
          orderProfit: profit, finalOrderProfit: profit,
        });
        continue;
      }

      if (orderType === "reso_voucher") {
        const fee = calcPaymentFee(amount, method, settings);
        let netImpact = hasFreeShipping ? (0 - settings.shippingCost - fee) : (shippingCharged - settings.shippingCost - fee);
        orders.push({
          ...(base as AdvancedOrderData),
          revenue: hasFreeShipping ? 0 : shippingCharged, productCost: 0, shippingRevenue: hasFreeShipping ? 0 : shippingCharged,
          paymentFees: fee, shippingCostActual: settings.shippingCost, logisticsMargin: netImpact, returnCosts: Math.abs(netImpact),
          orderProfit: netImpact, finalOrderProfit: netImpact,
          lossReason: netImpact < 0 ? "Voucher Cost" : undefined,
        });
        continue;
      }

      // Standard
      const hasAcceptedTag = tags.some((t: string) => t.toUpperCase().trim() === "ACCETTATO");
      const isCOD = method === "contrassegno";
      const isValid = status === "PAID" || status === "PARTIALLY_PAID" || (isCOD && hasAcceptedTag);

      if (!isValid) {
        orders.push({
          ...(base as AdvancedOrderData),
          type: "pending", revenue: amount, productCost: cogs, shippingRevenue: shippingCharged,
          paymentFees: 0, shippingCostActual: 0, logisticsMargin: 0, returnCosts: 0,
          orderProfit: 0, finalOrderProfit: 0,
        });
        continue;
      }

      const productRevenue = amount - shippingCharged;
      const paymentFees = calcPaymentFee(productRevenue, method, settings);
      const logistics = calcLogisticsMargin(method, hasFreeShipping, shippingCharged, settings);
      const revenueExVat = productRevenue / (1 + (settings.vatPercent / 100));
      const orderProfit = revenueExVat - cogs - paymentFees + logistics.margin;

      orders.push({
        ...(base as AdvancedOrderData),
        revenue: amount, productCost: cogs, shippingRevenue: logistics.shippingRev,
        shippingCostActual: settings.shippingCost, paymentFees, logisticsMargin: logistics.margin,
        returnCosts: 0, orderProfit, finalOrderProfit: orderProfit,
        lossReason: orderProfit < 0 ? "Margine Negativo" : undefined,
      });
    }

    hasNextPage = rawOrders.pageInfo.hasNextPage;
    cursor = rawOrders.pageInfo.endCursor;
    } catch (e) {
      console.error("Error fetching advanced analysis data:", e);
      break;
    }
  }

  // ─── AGGREGATIONS ───

  const dailyMap = new Map<string, AnalysisPeriod>();
  const monthlyMap = new Map<string, AnalysisPeriod>();
  const yearlyMap = new Map<string, AnalysisPeriod>();
  
  const paymentMethodMap = new Map<string, any>();
  const returnsMap = new Map<string, any>();

  const cashFlow: CashFlowData = {
    revenueCollected: 0, pendingCodRevenue: 0, returnedOrdersValue: 0,
    refundsIssued: 0, voucherValueIssued: 0, estimatedAvailableCash: 0, netCashPosition: 0
  };

  let totalCogs = 0;

  for (const o of orders) {
    if (o.type === "pending") {
      if (o.paymentMethod === "contrassegno") cashFlow.pendingCodRevenue += o.revenue;
      continue;
    }

    const d = new Date(o.createdAt);
    const dayKey = d.toISOString().split("T")[0];
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const yearKey = `${d.getFullYear()}`;

    // Helper init
    const initP = (p: string): AnalysisPeriod => ({ period: p, revenue: 0, orders: 0, adsSpend: 0, logisticsMargin: 0, netProfit: 0, profitMargin: 0, returnsCost: 0, returnedPackageCost: 0 });
    if (!dailyMap.has(dayKey)) dailyMap.set(dayKey, initP(dayKey));
    if (!monthlyMap.has(monthKey)) monthlyMap.set(monthKey, initP(monthKey));
    if (!yearlyMap.has(yearKey)) yearlyMap.set(yearKey, initP(yearKey));

    const applyPeriod = (m: Map<string, AnalysisPeriod>, k: string) => {
      const t = m.get(k)!;
      t.orders++;
      t.revenue += o.revenue;
      t.logisticsMargin += o.logisticsMargin;
      t.netProfit += o.finalOrderProfit;
      if (o.type === "ritorno_merce") t.returnedPackageCost += o.returnCosts;
      if (o.type !== "standard") t.returnsCost += o.returnCosts;
    };

    applyPeriod(dailyMap, dayKey);
    applyPeriod(monthlyMap, monthKey);
    applyPeriod(yearlyMap, yearKey);

    // Payment methods (Standard only)
    if (o.type === "standard") {
      if (!paymentMethodMap.has(o.paymentMethod)) paymentMethodMap.set(o.paymentMethod, { method: o.paymentMethod, ordersCount: 0, revenue: 0, fees: 0, profit: 0 });
      const pm = paymentMethodMap.get(o.paymentMethod)!;
      pm.ordersCount++;
      pm.revenue += o.revenue;
      pm.fees += o.paymentFees;
      pm.profit += o.finalOrderProfit;

      cashFlow.revenueCollected += o.revenue;
      totalCogs += o.productCost;
    }

    // Returns Analysis
    if (o.type !== "standard") {
      if (!returnsMap.has(o.type)) returnsMap.set(o.type, { type: o.type, count: 0, revenue: 0, cost: 0, netResult: 0 });
      const rm = returnsMap.get(o.type)!;
      rm.count++;
      rm.revenue += o.revenue;
      rm.cost += o.returnCosts;
      rm.netResult += o.finalOrderProfit;

      if (o.type === "ritorno_merce") cashFlow.returnedOrdersValue += o.revenue; // technically 0 revenue in o.revenue, but we know the package value
      if (o.type === "reso_rimborso_ritiro") cashFlow.refundsIssued += o.returnCosts; // Simplification
      if (o.type === "reso_voucher") cashFlow.voucherValueIssued += o.returnCosts; // Simplification
    }
  }

  const finalizePeriods = (m: Map<string, AnalysisPeriod>) => Array.from(m.values()).map(p => {
    p.profitMargin = p.revenue > 0 ? (p.netProfit / p.revenue) * 100 : 0;
    return p;
  }).sort((a, b) => b.period.localeCompare(a.period));

  const validOrders = orders.filter(o => o.type === "standard" || o.type.startsWith("reso_"));
  const sortedByProfitDesc = [...validOrders].sort((a, b) => b.finalOrderProfit - a.finalOrderProfit);
  const sortedByProfitAsc = [...validOrders].sort((a, b) => a.finalOrderProfit - b.finalOrderProfit);

  cashFlow.estimatedAvailableCash = cashFlow.revenueCollected - totalCogs - fixedCosts;
  cashFlow.netCashPosition = cashFlow.estimatedAvailableCash + cashFlow.pendingCodRevenue - cashFlow.returnedOrdersValue;

  return {
    orders,
    dailyAnalysis: finalizePeriods(dailyMap),
    monthlyAnalysis: finalizePeriods(monthlyMap),
    yearlyAnalysis: finalizePeriods(yearlyMap),
    paymentMethodAnalysis: Array.from(paymentMethodMap.values()).map(p => ({ ...p, avgProfit: p.ordersCount > 0 ? p.profit / p.ordersCount : 0 })),
    returnsAnalysis: Array.from(returnsMap.values()).map(r => ({ ...r, avgImpact: r.count > 0 ? r.netResult / r.count : 0 })),
    topOrders: sortedByProfitDesc.slice(0, 100),
    worstOrders: sortedByProfitAsc.slice(0, 100),
    cashFlow
  };
}
