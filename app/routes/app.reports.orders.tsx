import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigation, useSearchParams } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Badge,
  DataTable,
  Select,
  Button,
} from "@shopify/polaris";
import { useState } from "react";
import { RefreshIcon } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import { getOrdersDetail } from "../services/profit.server";
import type { OrderDetail } from "../services/profit.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const now = new Date();
  const month = parseInt(url.searchParams.get("month") || String(now.getMonth() + 1));
  const year = parseInt(url.searchParams.get("year") || String(now.getFullYear()));

  const { orders, hasNextPage } = await getOrdersDetail(admin, session.shop, { month, year });

  // Calculate totals
  const totals = orders.reduce(
    (acc, o) => {
      acc.revenue += o.revenue;
      acc.cogs += o.cogs;
      acc.shippingCost += o.shippingCost;
      acc.paymentFee += o.paymentFee;
      acc.netProfit += o.netProfit;
      return acc;
    },
    { revenue: 0, cogs: 0, shippingCost: 0, paymentFee: 0, netProfit: 0 }
  );

  return json({
    orders,
    totals,
    hasNextPage,
    selectedMonth: month,
    selectedYear: year,
  });
};

function getTypeBadge(type: OrderDetail["type"]) {
  switch (type) {
    case "valid":
      return <Badge tone="success">Valido</Badge>;
    case "cod_refused":
      return <Badge tone="critical">COD Rifiutato</Badge>;
    case "return_refund":
      return <Badge tone="warning">Reso Rimborso</Badge>;
    case "return_exchange":
      return <Badge tone="info">Reso Cambio</Badge>;
    case "pending":
      return <Badge>In Attesa</Badge>;
  }
}

const MONTH_OPTIONS = [
  { label: "Gennaio", value: "1" },
  { label: "Febbraio", value: "2" },
  { label: "Marzo", value: "3" },
  { label: "Aprile", value: "4" },
  { label: "Maggio", value: "5" },
  { label: "Giugno", value: "6" },
  { label: "Luglio", value: "7" },
  { label: "Agosto", value: "8" },
  { label: "Settembre", value: "9" },
  { label: "Ottobre", value: "10" },
  { label: "Novembre", value: "11" },
  { label: "Dicembre", value: "12" },
];

export default function OrdersDetailPage() {
  const { orders, totals, hasNextPage, selectedMonth, selectedYear } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  const [searchParams, setSearchParams] = useSearchParams();

  const [month, setMonth] = useState(String(selectedMonth));
  const [year, setYear] = useState(String(selectedYear));

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 3 }, (_, i) => ({
    label: String(currentYear - i),
    value: String(currentYear - i),
  }));

  const formatCurrency = (val: number) => `€${val.toFixed(2)}`;

  const handleFilter = () => {
    setSearchParams({ month, year });
  };

  const monthLabel = MONTH_OPTIONS.find((m) => m.value === String(selectedMonth))?.label || "";

  const rows = orders.map((order: OrderDetail) => {
    const date = new Date(order.createdAt);
    const dateStr = date.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });

    const profitColor = order.netProfit >= 0 ? "success" : "critical";

    return [
      <Text as="span" fontWeight="bold">{order.name}</Text>,
      dateStr,
      getTypeBadge(order.type),
      order.gateway,
      formatCurrency(order.revenue),
      formatCurrency(order.cogs),
      formatCurrency(order.shippingCost),
      formatCurrency(order.paymentFee),
      <Text as="span" tone={profitColor} fontWeight="bold">
        {formatCurrency(order.netProfit)}
      </Text>,
      <Text as="span" tone={profitColor}>
        {`${order.margin.toFixed(1)}%`}
      </Text>,
    ];
  });

  return (
    <Page
      backAction={{ content: "Dashboard", url: "/app/reports" }}
      title={`Dettaglio Ordini — ${monthLabel} ${selectedYear}`}
      primaryAction={
        <Button
          icon={RefreshIcon}
          loading={isLoading}
          onClick={handleFilter}
        >
          Aggiorna
        </Button>
      }
    >
      <BlockStack gap="500">
        {/* FILTRI */}
        <Card>
          <InlineStack gap="400" blockAlign="end">
            <div style={{ minWidth: 160 }}>
              <Select
                label="Mese"
                options={MONTH_OPTIONS}
                value={month}
                onChange={setMonth}
              />
            </div>
            <div style={{ minWidth: 120 }}>
              <Select
                label="Anno"
                options={yearOptions}
                value={year}
                onChange={setYear}
              />
            </div>
            <Button variant="primary" onClick={handleFilter} loading={isLoading}>
              Filtra
            </Button>
          </InlineStack>
        </Card>

        {/* RIEPILOGO */}
        <Card>
          <InlineStack gap="800" align="space-between">
            <BlockStack gap="100">
              <Text as="span" tone="subdued" variant="bodySm">Ordini nel periodo</Text>
              <Text as="p" variant="headingLg" fontWeight="bold">{orders.length}</Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" tone="subdued" variant="bodySm">Revenue Totale</Text>
              <Text as="p" variant="headingLg" fontWeight="bold">{formatCurrency(totals.revenue)}</Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" tone="subdued" variant="bodySm">COGS Totale</Text>
              <Text as="p" variant="headingLg" fontWeight="bold" tone="critical">{formatCurrency(totals.cogs)}</Text>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" tone="subdued" variant="bodySm">Profitto Netto</Text>
              <Text as="p" variant="headingLg" fontWeight="bold" tone={totals.netProfit >= 0 ? "success" : "critical"}>
                {formatCurrency(totals.netProfit)}
              </Text>
            </BlockStack>
          </InlineStack>
        </Card>

        {/* TABELLA ORDINI */}
        <Card padding="0">
          {orders.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center" }}>
              <Text as="p" tone="subdued">Nessun ordine trovato per il periodo selezionato.</Text>
            </div>
          ) : (
            <DataTable
              columnContentTypes={[
                "text",
                "text",
                "text",
                "text",
                "numeric",
                "numeric",
                "numeric",
                "numeric",
                "numeric",
                "numeric",
              ]}
              headings={[
                "Ordine",
                "Data",
                "Tipo",
                "Pagamento",
                "Revenue",
                "COGS",
                "Spedizione",
                "Fee",
                "Profitto",
                "Margine",
              ]}
              rows={rows}
              totals={[
                "",
                "",
                "",
                "TOTALE",
                formatCurrency(totals.revenue),
                formatCurrency(totals.cogs),
                formatCurrency(totals.shippingCost),
                formatCurrency(totals.paymentFee),
                formatCurrency(totals.netProfit),
                totals.revenue > 0
                  ? `${((totals.netProfit / totals.revenue) * 100).toFixed(1)}%`
                  : "0.0%",
              ]}
              totalsName={{ singular: "Totale", plural: "Totale" }}
              showTotalsInFooter
            />
          )}
        </Card>

        {hasNextPage && (
          <Text as="p" tone="subdued" alignment="center">
            Mostrati i primi 50 ordini. Per il calcolo completo consulta la dashboard principale.
          </Text>
        )}
      </BlockStack>
    </Page>
  );
}
