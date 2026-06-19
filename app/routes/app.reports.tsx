import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, Text, InlineStack, Button, TextField, Badge,
} from "@shopify/polaris";
import { useState } from "react";
import {
  CashDollarIcon, OrderIcon, RefreshIcon, AlertCircleIcon,
  SettingsIcon, BankIcon, DeliveryIcon,
} from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import { getProfitStats } from "../services/profit.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const stats = await getProfitStats(admin, session.shop);
  return json({ stats, lastUpdated: new Date().toISOString() });
};

function StatCard({ title, value, subtitle, tone }: {
  title: string; value: string | number; subtitle?: string; tone: "success" | "info" | "warning" | "critical" | "magic";
}) {
  const colors: Record<string, string> = { success: "#22c55e", critical: "#ef4444", warning: "#f59e0b", info: "#3b82f6", magic: "#8b5cf6" };
  return (
    <Card>
      <BlockStack gap="200">
        <Text variant="bodySm" as="span" tone="subdued">{title}</Text>
        <Text variant="headingXl" as="p" fontWeight="bold">
          <span style={{ color: colors[tone] }}>{value}</span>
        </Text>
        {subtitle && <Text variant="bodySm" as="span" tone="subdued">{subtitle}</Text>}
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

  const fmt = (v: number) => `€${v.toFixed(2)}`;
  const pct = (v: number) => `${v.toFixed(1)}%`;
  const time = new Date(lastUpdated).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  if (!isUnlocked) {
    return (
      <Page title="Civico26 Financial Intelligence">
        <Layout><Layout.Section>
          <Card>
            <BlockStack gap="400" align="center">
              <Text variant="headingMd" as="h2" alignment="center">Inserisci il PIN per accedere</Text>
              <div style={{ maxWidth: 200, margin: "0 auto" }}>
                <TextField label="PIN" labelHidden type="password" value={pin}
                  onChange={(v) => { setPin(v); setError(false); }} autoComplete="off"
                  error={error ? "PIN errato" : undefined} />
              </div>
              <div style={{ margin: "0 auto" }}>
                <Button variant="primary" onClick={() => { if (pin === "1010") setIsUnlocked(true); else { setError(true); setPin(""); } }}>
                  Sblocca
                </Button>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section></Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Financial Intelligence Dashboard"
      subtitle={`Ultimo aggiornamento: ${time}`}
      primaryAction={<Button icon={RefreshIcon} loading={isRefreshing} onClick={() => window.location.reload()}>Aggiorna</Button>}
      secondaryActions={[
        { content: "Dettaglio Ordini", icon: OrderIcon, url: "/app/reports/orders" },
        { content: "Impostazioni", icon: SettingsIcon, url: "/app/reports/settings" },
        { content: "Costi Fissi", icon: BankIcon, url: "/app/reports/costs" },
      ]}
    >
      <BlockStack gap="600">

        {/* ─── OGGI ─── */}
        <Text variant="headingLg" as="h2">📊 Oggi</Text>
        <Layout>
          <Layout.Section variant="oneThird">
            <StatCard title="Revenue Oggi" value={fmt(stats.today.revenue)} subtitle={`${stats.today.orders} ordini`} tone="info" />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard title="Profitto Netto Oggi" value={fmt(stats.today.netProfit)} subtitle={`Margine: ${pct(stats.today.margin)}`} tone={stats.today.netProfit >= 0 ? "success" : "critical"} />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard title="Logistics Margin Oggi" value={fmt(stats.today.logisticsMargin)} subtitle={`Free Ship Cost: ${fmt(stats.today.freeShippingCost)}`} tone="magic" />
          </Layout.Section>
        </Layout>

        {/* ─── MESE ─── */}
        <Text variant="headingLg" as="h2">📅 Mese Corrente</Text>
        <Layout>
          <Layout.Section variant="oneThird">
            <StatCard title="Revenue Mese" value={fmt(stats.thisMonth.revenue)} subtitle={`${stats.thisMonth.orders} ordini`} tone="info" />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard title="Profitto Netto Mese" value={fmt(stats.thisMonth.netProfit)} subtitle={`Margine: ${pct(stats.thisMonth.margin)}`} tone={stats.thisMonth.netProfit >= 0 ? "success" : "critical"} />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard title="Logistics Margin Mese" value={fmt(stats.thisMonth.logisticsMargin)} subtitle={`Free Ship Cost: ${fmt(stats.thisMonth.freeShippingCost)}`} tone="magic" />
          </Layout.Section>
        </Layout>

        {/* ─── LOGISTICA ─── */}
        <Text variant="headingLg" as="h2">🚚 Logistica (Anno)</Text>
        <Layout>
          <Layout.Section variant="oneThird">
            <StatCard title="Shipping Revenue" value={fmt(stats.thisYear.shippingRevenue)} subtitle="Da clienti che pagano la spedizione" tone="info" />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard title="COD Revenue" value={fmt(stats.thisYear.codRevenue)} subtitle="Fee contrassegno incassate" tone="info" />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard title="Logistics Margin Totale" value={fmt(stats.thisYear.logisticsMargin)} subtitle={`Free Ship Cost: ${fmt(stats.thisYear.freeShippingCost)}`} tone={stats.thisYear.logisticsMargin >= 0 ? "success" : "critical"} />
          </Layout.Section>
        </Layout>

        {/* ─── RESI ─── */}
        <Text variant="headingLg" as="h2">📦 Resi & Eccezioni (Anno)</Text>
        <Layout>
          <Layout.Section variant="oneThird">
            <StatCard title="Ritorno Merce (COD non ritirato)" value={`${stats.returns.ritornoMerce.count}`} subtitle={`Costo: ${fmt(stats.returns.ritornoMerce.cost)}`} tone="critical" />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard title="Reso Cliente Spedisce" value={`${stats.returns.resoClienteSpedisce.count}`} subtitle={`Costo: ${fmt(stats.returns.resoClienteSpedisce.cost)} | Media: ${fmt(stats.returns.resoClienteSpedisce.avgCost)}`} tone="warning" />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard title="Reso Rimborso Ritiro" value={`${stats.returns.resoRimborsoRitiro.count}`} subtitle={`Rev: ${fmt(stats.returns.resoRimborsoRitiro.revenue)} | Costo: ${fmt(stats.returns.resoRimborsoRitiro.cost)} | Profitto: ${fmt(stats.returns.resoRimborsoRitiro.netProfit)}`} tone="warning" />
          </Layout.Section>
        </Layout>
        <Layout>
          <Layout.Section variant="oneThird">
            <StatCard title="Reso Exchange" value={`${stats.returns.resoExchange.count}`} subtitle={`Rev: ${fmt(stats.returns.resoExchange.revenue)} | Costo: ${fmt(stats.returns.resoExchange.cost)} | Profitto: ${fmt(stats.returns.resoExchange.profit)}`} tone="info" />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard title="Reso Voucher" value={`${stats.returns.resoVoucher.count}`} subtitle={`Impatto Netto: ${fmt(stats.returns.resoVoucher.netImpact)}`} tone="warning" />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard title="Tasso Resi" value={pct(stats.returns.returnRate)} subtitle={`${stats.returns.totalReturns} resi su totale ordini`} tone={stats.returns.returnRate > 10 ? "critical" : "warning"} />
          </Layout.Section>
        </Layout>

        {/* ─── PERDITE ─── */}
        <Text variant="headingLg" as="h2">💸 Perdite (Anno)</Text>
        <Layout>
          <Layout.Section variant="oneThird">
            <StatCard title="Pacchi Resi (Ritorno Merce)" value={`${stats.losses.returnedPackagesCount}`} subtitle={`Costo: ${fmt(stats.losses.returnedPackagesCost)}`} tone="critical" />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard title="Costo Resi" value={fmt(stats.losses.returnsCost)} tone="critical" />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard title="Totale Soldi Persi" value={fmt(stats.losses.totalMoneyLost)} subtitle="Somma di tutte le perdite" tone="critical" />
          </Layout.Section>
        </Layout>

        {/* ─── KPI FINANZIARI ─── */}
        <Text variant="headingLg" as="h2">💰 KPI Finanziari</Text>
        <Layout>
          <Layout.Section variant="oneThird">
            <StatCard title="Profitto Medio per Ordine" value={fmt(stats.financials.avgOrderProfit)} subtitle={`AOV: ${fmt(stats.financials.avgOrderValue)}`} tone="info" />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard title="Profitto Anno" value={fmt(stats.thisYear.netProfit)} subtitle={`Margine: ${pct(stats.thisYear.margin)}`} tone={stats.thisYear.netProfit >= 0 ? "success" : "critical"} />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard title="Utile Netto Mese (dopo Costi Fissi)" value={fmt(stats.financials.netProfitAfterFixedCosts)} subtitle="Profitto mese - tutti i costi fissi" tone={stats.financials.netProfitAfterFixedCosts >= 0 ? "success" : "critical"} />
          </Layout.Section>
        </Layout>

      </BlockStack>
    </Page>
  );
}
