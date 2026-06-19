import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getAdvancedAnalysis } from "../services/advanced-analysis.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  
  // Optional filters from query params
  const q = url.searchParams.get("query")?.toLowerCase() || "";
  const types = url.searchParams.get("type")?.split(",").filter(Boolean) || [];
  const methods = url.searchParams.get("method")?.split(",").filter(Boolean) || [];

  const data = await getAdvancedAnalysis(admin, session.shop);
  
  let orders = data.orders;

  if (q) {
    orders = orders.filter(o => o.name.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q));
  }
  if (types.length > 0) {
    orders = orders.filter(o => types.includes(o.type));
  }
  if (methods.length > 0) {
    orders = orders.filter(o => methods.includes(o.paymentMethod));
  }

  const csvRows = [];
  
  // Header
  csvRows.push([
    "Order Number", "Date", "Customer Name", "Order Total", "Product Cost", 
    "Shipping Revenue", "Shipping Cost", "Payment Method", "Payment Fees", 
    "Logistics Margin", "Ads Cost Allocation", "Order Profit", "Final Order Profit", 
    "Tags", "Status", "Type"
  ].join(","));

  // Rows
  for (const o of orders) {
    const row = [
      o.name,
      new Date(o.createdAt).toISOString().split("T")[0],
      `"${o.customerName.replace(/"/g, '""')}"`,
      o.revenue,
      o.productCost,
      o.shippingRevenue,
      o.shippingCostActual,
      o.paymentMethod,
      o.paymentFees,
      o.logisticsMargin,
      o.adsAllocation,
      o.orderProfit,
      o.finalOrderProfit,
      `"${o.tags.join(";")}"`,
      o.status,
      o.type
    ];
    csvRows.push(row.join(","));
  }

  const csvString = csvRows.join("\n");

  return new Response(csvString, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders_export_${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
};
