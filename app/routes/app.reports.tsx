import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigation, Link as RemixLink } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineStack,
  Icon,
  Button,
  TextField,
  Badge,
} from "@shopify/polaris";
import { useState } from "react";
import { 
  CashDollarIcon, 
  OrderIcon, 
  RefreshIcon, 
  AlertCircleIcon, 
  SettingsIcon,
  BankIcon,
} from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import { getProfitStats } from "../services/profit.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const stats = await getProfitStats(admin, session.shop);

  return json({
    stats,
    lastUpdated: new Date().toISOString(),
  });
};

function StatCard({
  title,
  value,
  subtitle,
  icon,
  tone,
}: {
  title: string;
  value: string | number;
  subtitle?: string | React.ReactNode;
  icon: any;
  tone: "success" | "info" | "warning" | "critical" | "magic";
}) {
  const toneColors: Record<string, string> = {
    success: "#22c55e",
    critical: "#ef4444",
    warning: "#f59e0b",
    info: "#3b82f6",
    magic: "#8b5cf6",
  };
  const color = toneColors[tone];

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="bodySm" as="span" tone="subdued">
            {title}
          </Text>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: `${color}15`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon source={icon} tone={tone === "info" ? "info" : tone === "success" ? "success" : tone === "warning" ? "warning" : tone === "critical" ? "critical" : "base"} />
          </div>
        </InlineStack>
        <Text variant="heading2xl" as="p" fontWeight="bold">
          {value}
        </Text>
        {subtitle && (
          <Text variant="bodySm" as="span" tone="subdued">
            {subtitle}
          </Text>
        )}
      </BlockStack>
    </Card>
  );
}

export default function ProfitDashboard() {
  const { stats, lastUpdated } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isRefreshing = navigation.state === "loading";

  const [pin, setPin] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [error, setError] = useState(false);

  const formattedLastUpdated = new Date(lastUpdated).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const formatCurrency = (val: number) => `€${val.toFixed(2)}`;

  if (!isUnlocked) {
    return (
      <Page title="Civico26 Profit Dashboard">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400" align="center">
                <Text variant="headingMd" as="h2" alignment="center">
                  Inserisci il codice PIN per accedere alla dashboard finanziaria
                </Text>
                <div style={{ maxWidth: 200, margin: "0 auto" }}>
                  <TextField
                    label="Codice PIN"
                    labelHidden
                    type="password"
                    value={pin}
                    onChange={(val) => {
                      setPin(val);
                      setError(false);
                    }}
                    autoComplete="off"
                    error={error ? "PIN errato" : undefined}
                  />
                </div>
                <div style={{ margin: "0 auto" }}>
                  <Button
                    variant="primary"
                    onClick={() => {
                      if (pin === "1010") {
                        setIsUnlocked(true);
                      } else {
                        setError(true);
                        setPin("");
                      }
                    }}
                  >
                    Sblocca Dashboard
                  </Button>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Profit Dashboard"
      subtitle={`Ultimo aggiornamento: ${formattedLastUpdated}`}
      primaryAction={
        <Button
          icon={RefreshIcon}
          loading={isRefreshing}
          onClick={() => {
            window.location.reload();
          }}
        >
          Aggiorna dati
        </Button>
      }
      secondaryActions={[
        {
          content: "Dettaglio Ordini",
          icon: OrderIcon,
          url: "/app/reports/orders",
        },
        {
          content: "Impostazioni",
          icon: SettingsIcon,
          url: "/app/reports/settings",
        },
        {
          content: "Costi Fissi",
          icon: BankIcon,
          url: "/app/reports/costs",
        }
      ]}
    >
      <BlockStack gap="600">
        
        {/* KPI OGGI E MESE */}
        <Text variant="headingLg" as="h2">Panoramica Vendite & Profitto</Text>
        <Layout>
          <Layout.Section variant="oneThird">
            <StatCard
              title="Fatturato Oggi (Lordo)"
              value={formatCurrency(stats.today.revenue)}
              subtitle={`${stats.today.orders} ordini validi`}
              icon={CashDollarIcon}
              tone="info"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard
              title="Profitto Netto Oggi"
              value={formatCurrency(stats.today.netProfit)}
              subtitle={<Badge tone={stats.today.netProfit >= 0 ? "success" : "critical"}>{"Margine: " + stats.today.margin.toFixed(1) + "%"}</Badge>}
              icon={CashDollarIcon}
              tone="success"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard
              title="Profitto Netto Mese"
              value={formatCurrency(stats.thisMonth.netProfit)}
              subtitle={<Badge tone={stats.thisMonth.netProfit >= 0 ? "success" : "critical"}>{"Fatturato: " + formatCurrency(stats.thisMonth.revenue)}</Badge>}
              icon={CashDollarIcon}
              tone="magic"
            />
          </Layout.Section>
        </Layout>

        {/* PROBLEMI */}
        <Text variant="headingLg" as="h2">Problemi & Eccezioni (Anno in corso)</Text>
        <Layout>
          <Layout.Section variant="oneThird">
            <StatCard
              title="Perdite per Rifiuti (COD)"
              value={formatCurrency(stats.problems.refusedOrdersCost)}
              subtitle={`${stats.problems.refusedOrdersCount} ordini rifiutati`}
              icon={AlertCircleIcon}
              tone="critical"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard
              title="Costo Resi con Rimborso"
              value={formatCurrency(stats.problems.returnsRefundCost)}
              subtitle={`${stats.problems.returnsRefundCount} resi effettuati`}
              icon={AlertCircleIcon}
              tone="warning"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard
              title="Profitto da Resi con Cambio"
              value={formatCurrency(stats.problems.returnsExchangeProfit)}
              subtitle={`${stats.problems.returnsExchangeCount} cambi effettuati`}
              icon={OrderIcon}
              tone="success"
            />
          </Layout.Section>
        </Layout>

        {/* KPI FINANZIARI */}
        <Text variant="headingLg" as="h2">KPI Finanziari Globali</Text>
        <Layout>
          <Layout.Section variant="oneThird">
            <StatCard
              title="Profitto Medio per Ordine"
              value={formatCurrency(stats.financials.averageOrderProfit)}
              subtitle={`AOV: ${formatCurrency(stats.financials.averageOrderValue)}`}
              icon={CashDollarIcon}
              tone="info"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard
              title="Margine di Profitto Globale"
              value={`${stats.thisYear.margin.toFixed(1)}%`}
              subtitle={`Profitto YTD: ${formatCurrency(stats.thisYear.netProfit)}`}
              icon={CashDollarIcon}
              tone="magic"
            />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard
              title="Utile Netto Mese (dopo Costi Fissi)"
              value={formatCurrency(stats.financials.netProfitAfterFixedCosts)}
              subtitle="Dedotti tutti i costi mensili configurati"
              icon={BankIcon}
              tone={stats.financials.netProfitAfterFixedCosts >= 0 ? "success" : "critical"}
            />
          </Layout.Section>
        </Layout>

      </BlockStack>
    </Page>
  );
}
