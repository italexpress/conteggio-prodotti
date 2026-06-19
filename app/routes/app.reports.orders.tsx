import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigation, useSearchParams } from "@remix-run/react";
import {
  Page, Card, BlockStack, Text, InlineStack, Badge, DataTable, Select, Button,
} from "@shopify/polaris";
import { useState } from "react";
import { RefreshIcon } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import { getOrdersDetail } from "../services/profit.server";
import type { OrderDetail, OrderType } from "../services/profit.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const now = new Date();
  const month = parseInt(url.searchParams.get("month") || String(now.getMonth() + 1));
  const year = parseInt(url.searchParams.get("year") || String(now.getFullYear()));

  const { orders, hasNextPage } = await getOrdersDetail(admin, session.shop, { month, year });

  const totals = orders.reduce((acc, o) => {
    acc.revenue += o.revenue;
    acc.productCost += o.productCost;
    acc.paymentFees += o.paymentFees;
    acc.logisticsMargin += o.logisticsMargin;
    acc.finalProfit += o.finalOrderProfit;
    return acc;
  }, { revenue: 0, productCost: 0, paymentFees: 0, logisticsMargin: 0, finalProfit: 0 });

  return json({ orders, totals, hasNextPage, selectedMonth: month, selectedYear: year });
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

function methodLabel(m: string) {
  const map: Record<string, string> = {
    shopify_payments: "Shopify Pay",
    paypal: "PayPal",
    contrassegno: "COD",
    unknown: "N/A",
  };
  return map[m] || m;
}

const MONTHS = [
  { label: "Gennaio", value: "1" }, { label: "Febbraio", value: "2" },
  { label: "Marzo", value: "3" }, { label: "Aprile", value: "4" },
  { label: "Maggio", value: "5" }, { label: "Giugno", value: "6" },
  { label: "Luglio", value: "7" }, { label: "Agosto", value: "8" },
  { label: "Settembre", value: "9" }, { label: "Ottobre", value: "10" },
  { label: "Novembre", value: "11" }, { label: "Dicembre", value: "12" },
];

export default function OrdersDetailPage() {
  const { orders, totals, hasNextPage, selectedMonth, selectedYear } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  const [, setSearchParams] = useSearchParams();

  const [month, setMonth] = useState(String(selectedMonth));
  const [year, setYear] = useState(String(selectedYear));

  const now = new Date().getFullYear();
  const yearOpts = Array.from({ length: 3 }, (_, i) => ({ label: String(now - i), value: String(now - i) }));

  const fmt = (v: number) => `€${v.toFixed(2)}`;
  const handleFilter = () => setSearchParams({ month, year });

  const monthLabel = MONTHS.find(m => m.value === String(selectedMonth))?.label || "";

  const rows = orders.map((o: OrderDetail) => {
    const d = new Date(o.createdAt).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
    const tone = o.finalOrderProfit >= 0 ? "success" : "critical";
    return [
      <Text as="span" fontWeight="bold">{o.name}</Text>,
      d,
      typeBadge(o.type),
      methodLabel(o.paymentMethod),
      fmt(o.revenue),
      fmt(o.productCost),
      fmt(o.paymentFees),
      fmt(o.shippingRevenue),
      fmt(o.shippingCostActual),
      fmt(o.logisticsMargin),
      <Text as="span" tone={tone} fontWeight="bold">{fmt(o.finalOrderProfit)}</Text>,
    ];
  });

  return (
    <Page backAction={{ content: "Dashboard", url: "/app/reports" }}
      title={`Dettaglio Ordini — ${monthLabel} ${selectedYear}`}
      primaryAction={<Button icon={RefreshIcon} loading={isLoading} onClick={handleFilter}>Aggiorna</Button>}>
      <BlockStack gap="500">

        <Card>
          <InlineStack gap="400" blockAlign="end">
            <div style={{ minWidth: 160 }}>
              <Select label="Mese" options={MONTHS} value={month} onChange={setMonth} />
            </div>
            <div style={{ minWidth: 120 }}>
              <Select label="Anno" options={yearOpts} value={year} onChange={setYear} />
            </div>
            <Button variant="primary" onClick={handleFilter} loading={isLoading}>Filtra</Button>
          </InlineStack>
        </Card>

        <Card>
          <InlineStack gap="600" align="space-between">
            <BlockStack gap="100">
              <Text as="span" tone="subdued" variant="bodySm">Ordini</Text>
              <Text as="p" variant="headingLg" fontWeight="bold">{orders.length}</Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" tone="subdued" variant="bodySm">Revenue</Text>
              <Text as="p" variant="headingLg" fontWeight="bold">{fmt(totals.revenue)}</Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" tone="subdued" variant="bodySm">COGS</Text>
              <Text as="p" variant="headingLg" fontWeight="bold" tone="critical">{fmt(totals.productCost)}</Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" tone="subdued" variant="bodySm">Logistics Margin</Text>
              <Text as="p" variant="headingLg" fontWeight="bold" tone={totals.logisticsMargin >= 0 ? "success" : "critical"}>{fmt(totals.logisticsMargin)}</Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" tone="subdued" variant="bodySm">Profitto Finale</Text>
              <Text as="p" variant="headingLg" fontWeight="bold" tone={totals.finalProfit >= 0 ? "success" : "critical"}>{fmt(totals.finalProfit)}</Text>
            </BlockStack>
          </InlineStack>
        </Card>

        <Card padding="0">
          {orders.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center" }}>
              <Text as="p" tone="subdued">Nessun ordine trovato.</Text>
            </div>
          ) : (
            <DataTable
              columnContentTypes={["text","text","text","text","numeric","numeric","numeric","numeric","numeric","numeric","numeric"]}
              headings={["Ordine","Data","Tipo","Pagamento","Revenue","COGS","Fees","Ship Rev","Ship Cost","Log. Margin","Profitto"]}
              rows={rows}
              totals={["","","","TOTALE",fmt(totals.revenue),fmt(totals.productCost),fmt(totals.paymentFees),"","",fmt(totals.logisticsMargin),fmt(totals.finalProfit)]}
              totalsName={{ singular: "Totale", plural: "Totale" }}
              showTotalsInFooter
            />
          )}
        </Card>

        {hasNextPage && (
          <Text as="p" tone="subdued" alignment="center">Mostrati i primi 50 ordini.</Text>
        )}
      </BlockStack>
    </Page>
  );
}
