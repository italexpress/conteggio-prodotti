import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page, Card, BlockStack, Text, Layout, DataTable, Badge, Banner, List, InlineStack,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import { getAdvancedAnalysis } from "../services/advanced-analysis.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const orderId = params.id;
  // We fetch all and find it. For a single order, it's fine since the engine is fast.
  // A more optimized version would query just the ID, but for simplicity we reuse the engine.
  const data = await getAdvancedAnalysis(admin, session.shop);
  const order = data.orders.find(o => o.id.includes(orderId || ""));

  if (!order) {
    throw new Response("Ordine non trovato", { status: 404 });
  }

  return json({ order });
};

export default function OrderDrillDown() {
  const { order } = useLoaderData<typeof loader>();

  const fmt = (v: number) => `€${v.toFixed(2)}`;

  const tone = order.finalOrderProfit >= 0 ? "success" : "critical";

  return (
    <Page
      backAction={{ content: "Orders Analysis", url: "/app/reports/advanced/orders" }}
      title={`Ordine ${order.name}`}
      subtitle={`Data: ${new Date(order.createdAt).toLocaleString("it-IT")} | Cliente: ${order.customerName}`}
    >
      <BlockStack gap="500">
        <Layout>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Profit Calculator Validation</Text>
                <Text as="p" tone="subdued">Verifica calcoli passo passo per questo ordine (Sezione 12).</Text>

                <List type="number">
                  <List.Item>
                    <InlineStack align="space-between">
                      <Text as="span">Ricavi Totali (Cassa)</Text>
                      <Text as="span" fontWeight="bold">{fmt(order.revenue)}</Text>
                    </InlineStack>
                  </List.Item>
                  <List.Item>
                    <InlineStack align="space-between">
                      <Text as="span" tone="critical">Meno Costo Prodotti (COGS)</Text>
                      <Text as="span" tone="critical">-{fmt(order.productCost)}</Text>
                    </InlineStack>
                  </List.Item>
                  <List.Item>
                    <InlineStack align="space-between">
                      <Text as="span" tone="critical">Meno Fee Pagamento ({order.paymentMethod})</Text>
                      <Text as="span" tone="critical">-{fmt(order.paymentFees)}</Text>
                    </InlineStack>
                  </List.Item>
                  <List.Item>
                    <InlineStack align="space-between">
                      <Text as="span">Più/Meno Margine Logistico</Text>
                      <Text as="span" tone={order.logisticsMargin >= 0 ? "success" : "critical"}>
                        {order.logisticsMargin >= 0 ? "+" : ""}{fmt(order.logisticsMargin)}
                      </Text>
                    </InlineStack>
                  </List.Item>
                  <List.Item>
                    <InlineStack align="space-between">
                      <Text as="span" tone="critical">Meno Costi Reso</Text>
                      <Text as="span" tone="critical">-{fmt(order.returnCosts)}</Text>
                    </InlineStack>
                  </List.Item>
                  <List.Item>
                    <InlineStack align="space-between">
                      <Text as="span" tone="critical">Meno Ads (Da allocare)</Text>
                      <Text as="span" tone="critical">-{fmt(order.adsAllocation)}</Text>
                    </InlineStack>
                  </List.Item>
                </List>

                <hr style={{ borderColor: 'var(--p-color-border)', borderTopWidth: 1 }} />

                <InlineStack align="space-between">
                  <Text variant="headingLg" as="span">Final Profit</Text>
                  <Text variant="headingXl" as="span" tone={tone}>{fmt(order.finalOrderProfit)}</Text>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Dettagli Operativi</Text>
                
                <BlockStack gap="200">
                  <Text as="p"><strong>Tipo Ordine:</strong> <Badge>{order.type}</Badge></Text>
                  <Text as="p"><strong>Stato Finanziario:</strong> <Badge>{order.status}</Badge></Text>
                  <Text as="p"><strong>Metodo Pagamento:</strong> {order.paymentMethod}</Text>
                  <Text as="p">
                    <strong>Tags:</strong>{' '}
                    {order.tags.length > 0 ? order.tags.map(t => <Badge key={t}>{t}</Badge>) : "Nessuno"}
                  </Text>
                </BlockStack>

                {order.lossReason && (
                  <Banner tone="critical" title="Loss Detected">
                    {order.lossReason}
                  </Banner>
                )}
              </BlockStack>
            </Card>

            <div style={{ marginTop: 16 }}>
              <Card padding="0">
                <div style={{ padding: 16 }}>
                  <Text variant="headingMd" as="h3">Prodotti</Text>
                </div>
                <DataTable
                  columnContentTypes={['text', 'numeric', 'numeric', 'numeric']}
                  headings={['Prodotto', 'Quantità', 'Costo Unitario', 'Totale COGS']}
                  rows={order.lineItems.map(item => [
                    `${item.title} ${item.variantTitle ? `(${item.variantTitle})` : ""}`,
                    item.quantity,
                    fmt(item.unitCost),
                    fmt(item.quantity * item.unitCost)
                  ])}
                />
              </Card>
            </div>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
