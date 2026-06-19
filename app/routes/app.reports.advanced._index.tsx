import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, Text, Tabs, DataTable, Badge, InlineStack, Button,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { ExportIcon, OrderIcon } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import { getAdvancedAnalysis } from "../services/advanced-analysis.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const data = await getAdvancedAnalysis(admin, session.shop);
  return json(data);
};

export default function AdvancedAnalysisDashboard() {
  const data = useLoaderData<typeof loader>();
  const [selected, setSelected] = useState(0);

  const handleTabChange = useCallback((selectedTabIndex: number) => setSelected(selectedTabIndex), []);

  const tabs = [
    { id: 'periods', content: 'Analisi Periodi' },
    { id: 'methods', content: 'Metodi & Resi' },
    { id: 'topflop', content: 'Top & Flop Ordini' },
    { id: 'cashflow', content: 'Cash Flow' },
  ];

  const fmt = (v: number) => `€${v.toFixed(2)}`;
  const pct = (v: number) => `${v.toFixed(1)}%`;

  return (
    <Page
      backAction={{ content: 'Dashboard Base', url: '/app/reports' }}
      title="Analisi Avanzata"
      subtitle="Reportistica finanziaria dettagliata su tutto lo storico"
      primaryAction={{ content: 'Analisi Ordini', icon: OrderIcon, url: '/app/reports/advanced/orders' }}
      secondaryActions={[{ content: 'Esporta CSV', icon: ExportIcon, url: '/app/api/export' }]}
    >
      <BlockStack gap="500">
        <Card padding="0">
          <Tabs tabs={tabs} selected={selected} onSelect={handleTabChange} fitted />
        </Card>

        {selected === 0 && (
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Analisi Giornaliera</Text>
                <div style={{maxHeight: 400, overflowY: 'auto'}}>
                  <DataTable
                    columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric']}
                    headings={['Data', 'Revenue', 'Ordini', 'Logistics Margin', 'Profitto Netto', 'Margine %', 'Costo Resi', 'Pacchi Rifiutati']}
                    rows={data.dailyAnalysis.slice(0, 30).map(p => [
                      p.period, fmt(p.revenue), p.orders, fmt(p.logisticsMargin), 
                      <Text as="span" tone={p.netProfit >= 0 ? "success" : "critical"}>{fmt(p.netProfit)}</Text>,
                      pct(p.profitMargin), fmt(p.returnsCost), fmt(p.returnedPackageCost)
                    ])}
                  />
                </div>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Analisi Mensile</Text>
                <DataTable
                  columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric']}
                  headings={['Mese', 'Revenue', 'Ordini', 'Logistics Margin', 'Profitto Netto', 'Margine %', 'Costo Resi', 'Pacchi Rifiutati']}
                  rows={data.monthlyAnalysis.map(p => [
                    p.period, fmt(p.revenue), p.orders, fmt(p.logisticsMargin), 
                    <Text as="span" tone={p.netProfit >= 0 ? "success" : "critical"}>{fmt(p.netProfit)}</Text>,
                    pct(p.profitMargin), fmt(p.returnsCost), fmt(p.returnedPackageCost)
                  ])}
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Analisi Annuale</Text>
                <DataTable
                  columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric']}
                  headings={['Anno', 'Revenue', 'Ordini', 'Logistics Margin', 'Profitto Netto', 'Margine %']}
                  rows={data.yearlyAnalysis.map(p => [
                    p.period, fmt(p.revenue), p.orders, fmt(p.logisticsMargin), 
                    <Text as="span" tone={p.netProfit >= 0 ? "success" : "critical"}>{fmt(p.netProfit)}</Text>,
                    pct(p.profitMargin)
                  ])}
                />
              </BlockStack>
            </Card>
          </BlockStack>
        )}

        {selected === 1 && (
          <BlockStack gap="500">
            <Layout>
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">Analisi Metodi di Pagamento</Text>
                    <DataTable
                      columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric']}
                      headings={['Metodo', 'Ordini', 'Revenue', 'Fees', 'Profitto', 'Profitto Medio']}
                      rows={data.paymentMethodAnalysis.map(m => [
                        m.method, m.ordersCount, fmt(m.revenue), fmt(m.fees), 
                        <Text as="span" tone={m.profit >= 0 ? "success" : "critical"}>{fmt(m.profit)}</Text>,
                        fmt(m.avgProfit)
                      ])}
                    />
                  </BlockStack>
                </Card>
              </Layout.Section>
              
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">Analisi Costi di Reso</Text>
                    <DataTable
                      columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric']}
                      headings={['Tipo', 'Quantità', 'Revenue', 'Costi (Perdite)', 'Impatto Netto']}
                      rows={data.returnsAnalysis.map(r => [
                        r.type, r.count, fmt(r.revenue), fmt(r.cost),
                        <Text as="span" tone={r.netResult >= 0 ? "success" : "critical"}>{fmt(r.netResult)}</Text>
                      ])}
                    />
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </BlockStack>
        )}

        {selected === 2 && (
          <BlockStack gap="500">
            <Layout>
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3" tone="success">Top 100 Ordini (Maggior Profitto)</Text>
                    <div style={{maxHeight: 500, overflowY: 'auto'}}>
                      <DataTable
                        columnContentTypes={['text', 'text', 'numeric', 'numeric']}
                        headings={['Ordine', 'Data', 'Revenue', 'Profitto']}
                        rows={data.topOrders.map(o => [
                          <Button url={`/app/reports/advanced/orders/${o.id.split('/').pop()}`} variant="plain">{o.name}</Button>,
                          new Date(o.createdAt).toLocaleDateString(),
                          fmt(o.revenue),
                          <Text as="span" tone="success" fontWeight="bold">{fmt(o.finalOrderProfit)}</Text>
                        ])}
                      />
                    </div>
                  </BlockStack>
                </Card>
              </Layout.Section>
              
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3" tone="critical">Worst 100 Ordini (Maggior Perdita)</Text>
                    <div style={{maxHeight: 500, overflowY: 'auto'}}>
                      <DataTable
                        columnContentTypes={['text', 'text', 'numeric', 'text']}
                        headings={['Ordine', 'Data', 'Profitto', 'Motivo Perdita']}
                        rows={data.worstOrders.map(o => [
                          <Button url={`/app/reports/advanced/orders/${o.id.split('/').pop()}`} variant="plain">{o.name}</Button>,
                          new Date(o.createdAt).toLocaleDateString(),
                          <Text as="span" tone="critical" fontWeight="bold">{fmt(o.finalOrderProfit)}</Text>,
                          o.lossReason || "Costi Alti"
                        ])}
                      />
                    </div>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </BlockStack>
        )}

        {selected === 3 && (
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Cash Flow (Flusso di Cassa Reale)</Text>
                <Layout>
                  <Layout.Section variant="oneThird">
                    <BlockStack gap="200">
                      <Text as="span" tone="subdued">Revenue Totale Incassata</Text>
                      <Text as="p" variant="headingLg" tone="info">{fmt(data.cashFlow.revenueCollected)}</Text>
                    </BlockStack>
                  </Layout.Section>
                  <Layout.Section variant="oneThird">
                    <BlockStack gap="200">
                      <Text as="span" tone="subdued">Incassi COD In Sospeso (Pending)</Text>
                      <Text as="p" variant="headingLg" tone="warning">{fmt(data.cashFlow.pendingCodRevenue)}</Text>
                    </BlockStack>
                  </Layout.Section>
                  <Layout.Section variant="oneThird">
                    <BlockStack gap="200">
                      <Text as="span" tone="subdued">Valore Merce Rifiutata/Resa</Text>
                      <Text as="p" variant="headingLg" tone="critical">{fmt(data.cashFlow.returnedOrdersValue)}</Text>
                    </BlockStack>
                  </Layout.Section>
                </Layout>
                
                <hr style={{ borderColor: 'var(--p-color-border)', borderTopWidth: 1 }} />
                
                <Layout>
                  <Layout.Section variant="oneHalf">
                    <BlockStack gap="200">
                      <Text as="span" tone="subdued">Liquidità Disponibile Stimata (Dopo COGS e Costi Fissi)</Text>
                      <Text as="p" variant="headingXl" tone={data.cashFlow.estimatedAvailableCash >= 0 ? "success" : "critical"}>
                        {fmt(data.cashFlow.estimatedAvailableCash)}
                      </Text>
                    </BlockStack>
                  </Layout.Section>
                  <Layout.Section variant="oneHalf">
                    <BlockStack gap="200">
                      <Text as="span" tone="subdued">Posizione Finanziaria Netta (Liquidità + Crediti - Resi stimati)</Text>
                      <Text as="p" variant="headingXl" tone={data.cashFlow.netCashPosition >= 0 ? "magic" : "critical"}>
                        {fmt(data.cashFlow.netCashPosition)}
                      </Text>
                    </BlockStack>
                  </Layout.Section>
                </Layout>
              </BlockStack>
            </Card>
          </BlockStack>
        )}

      </BlockStack>
    </Page>
  );
}
