import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page, Card, BlockStack, Text, DataTable, Badge, Filters, ChoiceList, RangeSlider, Button,
} from "@shopify/polaris";
import { useState, useCallback, useMemo } from "react";
import { ExportIcon } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import { getAdvancedAnalysis } from "../services/advanced-analysis.server";
import type { AdvancedOrderData, OrderType } from "../services/advanced-analysis.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const data = await getAdvancedAnalysis(admin, session.shop);
  return json({ orders: data.orders });
};

function typeBadge(type: OrderType) {
  const map: Record<OrderType, { label: string; tone: any }> = {
    standard: { label: "Standard", tone: "success" },
    ritorno_merce: { label: "Ritorno Merce", tone: "critical" },
    reso_cliente_spedisce: { label: "Reso Cl. Spedisce", tone: "warning" },
    reso_rimborso_ritiro: { label: "Rimborso Ritiro", tone: "warning" },
    reso_exchange: { label: "Exchange", tone: "info" },
    reso_voucher: { label: "Voucher", tone: "attention" },
    pending: { label: "In Attesa", tone: undefined },
  };
  const m = map[type];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export default function AdvancedOrdersAnalysis() {
  const { orders } = useLoaderData<typeof loader>();

  // Sorting
  const [sortValue, setSortValue] = useState<string>("date_desc");
  // Filtering
  const [queryValue, setQueryValue] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [methodFilter, setMethodFilter] = useState<string[]>([]);

  const handleQueryValueChange = useCallback((v: string) => setQueryValue(v), []);
  const handleQueryValueRemove = useCallback(() => setQueryValue(""), []);
  const handleTypeRemove = useCallback(() => setTypeFilter([]), []);
  const handleMethodRemove = useCallback(() => setMethodFilter([]), []);
  const handleClearAll = useCallback(() => {
    handleQueryValueRemove();
    handleTypeRemove();
    handleMethodRemove();
  }, [handleQueryValueRemove, handleTypeRemove, handleMethodRemove]);

  const filters = [
    {
      key: "type",
      label: "Tipo Ordine",
      filter: (
        <ChoiceList
          title="Tipo Ordine"
          titleHidden
          choices={[
            { label: "Standard", value: "standard" },
            { label: "Ritorno Merce", value: "ritorno_merce" },
            { label: "Rimborso Ritiro", value: "reso_rimborso_ritiro" },
            { label: "In Attesa", value: "pending" },
          ]}
          selected={typeFilter}
          onChange={setTypeFilter}
          allowMultiple
        />
      ),
      shortcut: true,
    },
    {
      key: "method",
      label: "Metodo Pagamento",
      filter: (
        <ChoiceList
          title="Metodo Pagamento"
          titleHidden
          choices={[
            { label: "Shopify Payments", value: "shopify_payments" },
            { label: "PayPal", value: "paypal" },
            { label: "Contrassegno", value: "contrassegno" },
          ]}
          selected={methodFilter}
          onChange={setMethodFilter}
          allowMultiple
        />
      ),
      shortcut: true,
    },
  ];

  const appliedFilters = [];
  if (typeFilter.length > 0) {
    appliedFilters.push({ key: "type", label: `Tipo: ${typeFilter.join(", ")}`, onRemove: handleTypeRemove });
  }
  if (methodFilter.length > 0) {
    appliedFilters.push({ key: "method", label: `Metodo: ${methodFilter.join(", ")}`, onRemove: handleMethodRemove });
  }

  // Filter & Sort Logic
  const filteredOrders = useMemo(() => {
    let result = orders;

    if (queryValue) {
      const q = queryValue.toLowerCase();
      result = result.filter(o => o.name.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q));
    }
    if (typeFilter.length > 0) {
      result = result.filter(o => typeFilter.includes(o.type));
    }
    if (methodFilter.length > 0) {
      result = result.filter(o => methodFilter.includes(o.paymentMethod));
    }

    result.sort((a, b) => {
      switch (sortValue) {
        case "profit_desc": return b.finalOrderProfit - a.finalOrderProfit;
        case "profit_asc": return a.finalOrderProfit - b.finalOrderProfit;
        case "rev_desc": return b.revenue - a.revenue;
        case "rev_asc": return a.revenue - b.revenue;
        case "date_asc": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "date_desc": default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  }, [orders, queryValue, typeFilter, methodFilter, sortValue]);

  const fmt = (v: number) => `€${v.toFixed(2)}`;

  const rows = filteredOrders.slice(0, 100).map((o: AdvancedOrderData) => [
    <Button url={`/app/reports/advanced/orders/${o.id.split("/").pop()}`} variant="plain">{o.name}</Button>,
    new Date(o.createdAt).toLocaleDateString("it-IT"),
    o.customerName,
    fmt(o.revenue),
    fmt(o.productCost),
    fmt(o.shippingRevenue),
    fmt(o.shippingCostActual),
    o.paymentMethod,
    fmt(o.paymentFees),
    fmt(o.logisticsMargin),
    fmt(o.adsAllocation),
    fmt(o.orderProfit),
    <Text as="span" tone={o.finalOrderProfit >= 0 ? "success" : "critical"} fontWeight="bold">{fmt(o.finalOrderProfit)}</Text>,
    typeBadge(o.type),
    o.status
  ]);

  return (
    <Page
      backAction={{ content: "Analisi Avanzata", url: "/app/reports/advanced" }}
      title="Orders Analysis"
      subtitle="Analisi granulare di tutti gli ordini"
      primaryAction={{ content: "Esporta CSV Filtrati", icon: ExportIcon, url: `/app/api/export?query=${queryValue}&type=${typeFilter.join(',')}&method=${methodFilter.join(',')}` }}
    >
      <BlockStack gap="500">
        <Card padding="0">
          <div style={{ padding: '16px' }}>
            <Filters
              queryValue={queryValue}
              filters={filters}
              appliedFilters={appliedFilters}
              onQueryChange={handleQueryValueChange}
              onQueryClear={handleQueryValueRemove}
              onClearAll={handleClearAll}
              queryPlaceholder="Cerca ordine o cliente..."
            >
              <div style={{ paddingLeft: '8px' }}>
                <Button onClick={() => setSortValue(p => p.startsWith('profit') ? (p === 'profit_desc' ? 'profit_asc' : 'date_desc') : 'profit_desc')}>
                  Ordina per Profitto
                </Button>
              </div>
            </Filters>
          </div>
          
          <DataTable
            columnContentTypes={[
              "text", "text", "text", "numeric", "numeric", "numeric", "numeric", "text", "numeric", "numeric", "numeric", "numeric", "numeric", "text", "text"
            ]}
            headings={[
              "Ordine", "Data", "Cliente", "Total", "COGS", "Ship Rev", "Ship Cost", "Metodo", "Fees", "Log. Margin", "Ads", "Profit", "Final Profit", "Tipo", "Stato"
            ]}
            rows={rows}
            defaultSortDirection="descending"
          />
          {filteredOrders.length > 100 && (
            <div style={{ padding: 16, textAlign: "center" }}>
              <Text as="p" tone="subdued">Mostrati i primi 100 ordini filtrati su {filteredOrders.length} totali.</Text>
            </div>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
