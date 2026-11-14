import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  BlockStack,
  Button,
  InlineStack,
  Card,
  Text,
  Badge,
  Icon,
  Box,
  Divider,
  Tabs,
  ProgressBar,
} from "@shopify/polaris";
import {
  RefreshIcon,
  OrderIcon,
  ProductIcon,
  DeliveryIcon,
  CheckCircleIcon,
} from "@shopify/polaris-icons";
import { useState, useMemo } from "react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getPackPlan, getPackProduct, getPackCatalogPage } from "../services/packs.server";
import { PackPlan } from "../components/PackPlan";
import { getAggregatedProducts } from "../services/orders.server";
import { getFulfillmentFollowup } from '../services/fulfillment-followup.server';
import { enrichOrderContacts } from '../services/order-contacts.server';
import { normalizeContactPhone } from '../services/whatsapp';
import {
  getIncomingProducts,
  getAggregatedIncoming,
  addIncomingProduct,
  deleteIncomingProduct,
} from "../services/incoming.server";
import {
  getOutOfStockProducts,
  addOutOfStockProduct,
  removeOutOfStockProduct,
} from "../services/out-of-stock.server";

import { ProductsNeededTable } from "../components/ProductsNeededTable";
import { IncomingProductForm } from "../components/IncomingProductForm";
import { IncomingProductList } from "../components/IncomingProductList";
import { DifferenceTable } from "../components/DifferenceTable";
import { UnconfirmedCodList } from "../components/UnconfirmedCodList";
import { TerminatedProductsList } from "../components/TerminatedProductsList";

// --- LOADER: carica dati ordini + merce in arrivo ---
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const packParams = new URL(request.url).searchParams;
  const packCatalog = packParams.get("packCatalog") === "1"
    ? await getPackCatalogPage(admin, packParams.get("packCursor")) : null;

  // Carica in parallelo ordini aggregati e merce in arrivo
  const [orderData, incomingItems, incomingAggregated, outOfStockProducts, followupData] = await Promise.all([
    getAggregatedProducts(admin),
    getIncomingProducts(shop),
    getAggregatedIncoming(shop),
    getOutOfStockProducts(shop),
    getFulfillmentFollowup(admin),
  ]);

  // Converti la Map in un oggetto serializzabile per il client
  const incomingMap: Record<string, number> = {};
  incomingAggregated.forEach((value, key) => {
    incomingMap[key] = value.totalQuantity;
  });

  const contactedOrders=await enrichOrderContacts(admin,shop,[...followupData,...orderData.unconfirmedCodOrders.filter(o=>!followupData.some(f=>f.id===o.id))]);
  const followupOrders=followupData.map(o=>contactedOrders.find(c=>c.id===o.id)!);
  const unconfirmedCodOrders=orderData.unconfirmedCodOrders.map(o=>({...o,...contactedOrders.find(c=>c.id===o.id)}));

  return json({
    orderedProductIds: (await prisma.productPack.findMany({ where: { shop, ordered: true }, select: { productId: true } })).map(p => p.productId),
    packPlan: await getPackPlan(admin, shop, orderData.products, packCatalog?.ids),
    packCatalog,
    products: orderData.products,
    orderCount: orderData.orderCount,
    codAcceptedCount: orderData.codAcceptedCount,
    unconfirmedCodOrders,
    followupOrders,
    affectedOrdersMap: orderData.affectedOrdersMap,
    incomingItems,
    incomingMap,
    outOfStockProducts,
    lastUpdated: new Date().toISOString(),
  });
};

// --- ACTION: gestione form merce in arrivo ---
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  switch (intent) {
    case 'saveOrderPhone': {
      const orderId=String(formData.get('orderId') || '');
      const phone=normalizeContactPhone(String(formData.get('phone') || ''));
      if (!/^gid:\/\/shopify\/Order\/\d+$/.test(orderId) || !phone) return json({error:'Inserisci un numero valido con prefisso internazionale, per esempio +39.'},{status:400});
      const {admin}=await authenticate.admin(request);
      const response=await admin.graphql(`query ContactOrder($id: ID!) { order(id: $id) { id } }`,{variables:{id:orderId}});
      const body=await response.json() as any;
      if (body.errors || !body.data?.order) return json({error:'Ordine non accessibile in questo negozio'},{status:400});
      await prisma.orderContact.upsert({where:{shop_orderId:{shop,orderId}},create:{shop,orderId,phone},update:{phone}});
      return json({success:true});
    }
    case "setPackOrdered": {
      const productId = String(formData.get("productId") || "");
      const value = formData.get("ordered");
      if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productId) || (value !== "true" && value !== "false")) {
        return json({ error: "Stato prodotto non valido" }, { status: 400 });
      }
      const { admin } = await authenticate.admin(request);
      await getPackProduct(admin, productId);
      const ordered = value === "true";
      await prisma.productPack.upsert({ where: { shop_productId: { shop, productId } }, create: { shop, productId, composition: "", ordered }, update: { ordered } });
      return json({ success: true });
    }
    case "savePack": {
      const productId = String(formData.get("productId") || "");
      const composition = String(formData.get("composition") || "");
      if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productId)) return json({ error: "Prodotto non valido" }, { status: 400 });
      const { admin } = await authenticate.admin(request);
      const product = await getPackProduct(admin, productId);
      if (!product.options.includes(composition)) return json({ error: "Composizione incompatibile con le taglie Shopify" }, { status: 400 });
      await prisma.productPack.upsert({ where: { shop_productId: { shop, productId } }, create: { shop, productId, composition }, update: { composition } });
      return json({ success: true });
    }
    case "addIncoming": {
      const productId = formData.get("productId") as string;
      const variantId = formData.get("variantId") as string;
      const productTitle = formData.get("productTitle") as string;
      const variantTitle = formData.get("variantTitle") as string;
      const displayName = formData.get("displayName") as string;
      const quantity = parseInt(formData.get("quantity") as string, 10);
      const expectedArrivalDate =
        (formData.get("expectedArrivalDate") as string) || undefined;

      if (!productId || !variantId || !displayName || !quantity || quantity <= 0) {
        return json({ error: "Dati mancanti" }, { status: 400 });
      }

      await addIncomingProduct({
        shop,
        productId,
        variantId,
        productTitle,
        variantTitle,
        displayName,
        quantity,
        expectedArrivalDate: expectedArrivalDate || undefined,
      });

      return json({ success: true });
    }

    case "addIncomingBatch": {
      const batchData = formData.get("batchData") as string;
      if (!batchData) {
        return json({ error: "Dati batch mancanti" }, { status: 400 });
      }

      const items = JSON.parse(batchData);
      
      for (const item of items) {
        if (!item.productId || !item.variantId || !item.quantity || item.quantity <= 0) continue;
        await addIncomingProduct({
          shop,
          productId: item.productId,
          variantId: item.variantId,
          productTitle: item.productTitle,
          variantTitle: item.variantTitle,
          displayName: item.displayName,
          quantity: item.quantity,
          expectedArrivalDate: item.expectedArrivalDate || undefined,
        });
      }

      return json({ success: true });
    }


    case "deleteIncoming": {
      const deleteId = formData.get("deleteId") as string;
      if (!deleteId) {
        return json({ error: "ID mancante" }, { status: 400 });
      }

      await deleteIncomingProduct(deleteId, shop);
      return json({ success: true });
    }

    case "addOutOfStock": {
      const variantId = formData.get("variantId") as string;
      const displayName = formData.get("displayName") as string;
      if (!variantId || !displayName) {
        return json({ error: "Dati mancanti" }, { status: 400 });
      }

      await addOutOfStockProduct({
        shop,
        variantId,
        displayName,
      });

      // Aggiorna Shopify: togli la spunta "Continua a vendere" e azzera giacenza
      const { admin } = await authenticate.admin(request);
      try {
        // 1. Trova Inventory Item e Location
        const resQuery = await admin.graphql(
          `query getVariantData($id: ID!) {
            productVariant(id: $id) {
              inventoryItem {
                id
                inventoryLevels(first: 1) {
                  edges {
                    node {
                      location {
                        id
                      }
                    }
                  }
                }
              }
            }
          }`,
          { variables: { id: variantId } }
        );
        const queryData = await resQuery.json();
        const inventoryItemId = queryData.data?.productVariant?.inventoryItem?.id;
        const locationId = queryData.data?.productVariant?.inventoryItem?.inventoryLevels?.edges?.[0]?.node?.location?.id;

        // 2. Azzera le scorte
        if (inventoryItemId && locationId) {
          await admin.graphql(
            `mutation setInventory($input: InventorySetOnHandQuantitiesInput!) {
              inventorySetOnHandQuantities(input: $input) {
                userErrors {
                  message
                }
              }
            }`,
            {
              variables: {
                input: {
                  reason: "correction",
                  setQuantities: [
                    {
                      inventoryItemId,
                      locationId,
                      quantity: 0,
                    },
                  ],
                },
              },
            }
          );
        }

        // 3. Togli la spunta (imposta policy a DENY)
        const variantUpdateRes = await admin.graphql(
          `mutation updateVariant($input: ProductVariantInput!) {
            productVariantUpdate(input: $input) {
              userErrors {
                message
              }
            }
          }`,
          {
            variables: {
              input: {
                id: variantId,
                inventoryPolicy: "DENY",
              },
            },
          }
        );
        const variantUpdateData = await variantUpdateRes.json();
        if (variantUpdateData.data?.productVariantUpdate?.userErrors?.length > 0) {
           console.error("Variant Update Errors:", variantUpdateData.data.productVariantUpdate.userErrors);
        }
      } catch (err) {
        console.error("Failed to update inventory on Shopify:", err);
        // Non blocchiamo l'azione locale se Shopify fallisce (es. permessi mancanti)
      }

      return json({ success: true });
    }

    case "removeOutOfStock": {
      const deleteId = formData.get("id") as string;
      const variantId = formData.get("variantId") as string;
      if (!deleteId) {
        return json({ error: "ID mancante" }, { status: 400 });
      }

      await removeOutOfStockProduct(deleteId, shop);

      // Aggiorna Shopify: rimetti la spunta "Continua a vendere quando esaurito"
      if (variantId) {
        const { admin } = await authenticate.admin(request);
        try {
          await admin.graphql(
            `mutation updateVariant($input: ProductVariantInput!) {
              productVariantUpdate(input: $input) {
                userErrors {
                  message
                }
              }
            }`,
            {
              variables: {
                input: {
                  id: variantId,
                  inventoryPolicy: "CONTINUE",
                },
              },
            }
          );
        } catch (err) {
          console.error("Failed to restore inventory policy on Shopify:", err);
        }
      }

      return json({ success: true });
    }

    case "acceptCod": {
      const orderId = formData.get("orderId") as string;
      if (!orderId) {
        return json({ error: "ID ordine mancante" }, { status: 400 });
      }

      const { admin } = await authenticate.admin(request);
      
      try {
        const response = await admin.graphql(
          `mutation addTags($id: ID!, $tags: [String!]!) {
            tagsAdd(id: $id, tags: $tags) {
              userErrors {
                message
              }
            }
          }`,
          {
            variables: {
              id: orderId,
              tags: ["ACCETTATO"],
            },
          }
        );
        const responseData = await response.json();
        if (responseData.data?.tagsAdd?.userErrors?.length > 0) {
           console.error("Tags Add Errors:", responseData.data.tagsAdd.userErrors);
        }
      } catch (err) {
        console.error("Failed to add tag to order on Shopify:", err);
      }

      return json({ success: true });
    }

    default:
      return json({ error: "Azione non riconosciuta" }, { status: 400 });
  }
};

// --- Componente Stat Card ---
function StatCard({
  title,
  value,
  icon,
  tone,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: any;
  tone?: "success" | "critical" | "warning" | "info" | "magic";
  subtitle?: string;
}) {
  const toneColors: Record<string, string> = {
    success: "#22c55e",
    critical: "#ef4444",
    warning: "#f59e0b",
    info: "#3b82f6",
    magic: "#8b5cf6",
  };
  const color = toneColors[tone || "info"];

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
            <Icon source={icon} tone={tone === "info" ? "info" : tone === "success" ? "success" : tone === "critical" ? "critical" : "base"} />
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

// --- PAGINA PRINCIPALE ---
export default function OrderManagerIndex() {
  const { followupOrders, orderedProductIds, packPlan, packCatalog, products, orderCount, codAcceptedCount, unconfirmedCodOrders, affectedOrdersMap, incomingItems, incomingMap, outOfStockProducts, lastUpdated } =
    useLoaderData<typeof loader>();

  const navigation = useNavigation();
  const isRefreshing = navigation.state === "loading";

  const [selectedTab, setSelectedTab] = useState(0);

  const formattedLastUpdated = new Date(lastUpdated).toLocaleTimeString(
    "it-IT",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }
  );

  // Calcola statistiche
  const totalItems = products.reduce((sum, p) => sum + p.totalQuantity, 0);
  const totalCod = products.reduce((sum, p) => sum + p.codQuantity, 0);
  const totalCodAccepted = products.reduce((sum, p) => sum + p.codAcceptedQuantity, 0);
  const totalIncoming = Object.values(incomingMap).reduce((sum, q) => sum + q, 0);

  // Calcola copertura
  const coveredProducts = products.filter((p) => {
    const incoming = incomingMap[p.variantId] || 0;
    return incoming >= p.totalQuantity;
  }).length;
  const productsWithNeeds = products.filter((p) => p.totalQuantity > 0).length;
  const coveragePercent =
    productsWithNeeds > 0
      ? Math.round((coveredProducts / productsWithNeeds) * 100)
      : 100;

  const tabs = [
    {
      id: "prodotti",
      content: `📦 Prodotti necessari (${products.length})`,
      panelID: "prodotti-panel",
    },
    {
      id: "arrivo",
      content: `🚚 Merce in arrivo (${incomingItems.length})`,
      panelID: "arrivo-panel",
    },
    {
      id: "riepilogo",
      content: "📊 Riepilogo differenze",
      panelID: "riepilogo-panel",
    },
    {
      id: "cod-non-confermati",
      content: `⚠️ COD da confermare (${unconfirmedCodOrders.length})`,
      panelID: "cod-panel",
    },
    {
      id: "terminati",
      content: `🚫 Terminati (${outOfStockProducts.length})`,
      panelID: "terminati-panel",
    },
    {
      id: "pacchi",
      content: "📦 Composizioni e pacchi interi",
      panelID: "pacchi-panel",
    },
    {
      id: 'ordini-da-evadere',
      content: `🕒 Ordini da evadere (${followupOrders.length})`,
      panelID: 'followup-panel',
    },
  ];

  const outOfStockVariantIds = outOfStockProducts.map(p => p.variantId);
  const activeProducts = products.filter(p => !outOfStockVariantIds.includes(p.variantId));

  return (
    <Page
      title="Conteggio Prodotti"
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
    >
      <BlockStack gap="600">
        {/* DASHBOARD STATISTICHE */}
        <Layout>
          <Layout.Section variant="oneHalf">
            <StatCard
              title="Ordini aperti"
              value={orderCount}
              icon={OrderIcon}
              tone="info"
              subtitle="Da evadere"
            />
          </Layout.Section>
          <Layout.Section variant="oneHalf">
            <StatCard
              title="Pezzi totali"
              value={totalItems}
              icon={ProductIcon}
              tone="magic"
              subtitle={`${products.length} prodotti diversi`}
            />
          </Layout.Section>
          <Layout.Section variant="oneHalf">
            <StatCard
              title="In contrassegno"
              value={totalCod}
              icon={DeliveryIcon}
              tone="warning"
              subtitle={`${totalCodAccepted} pz accettati su ${totalCod}`}
            />
          </Layout.Section>
          <Layout.Section variant="oneHalf">
            <StatCard
              title="COD Accettati ✅"
              value={totalCodAccepted}
              icon={CheckCircleIcon}
              tone="success"
              subtitle={`${codAcceptedCount} ordini con tag ACCETTATO`}
            />
          </Layout.Section>
        </Layout>

        {/* BARRA DI COPERTURA */}
        {productsWithNeeds > 0 && Object.keys(incomingMap).length > 0 && (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingSm" as="h3">
                  Copertura ordini
                </Text>
                <Badge
                  tone={
                    coveragePercent === 100
                      ? "success"
                      : coveragePercent >= 50
                      ? "warning"
                      : "critical"
                  }
                >{String(coveredProducts) + "/" + String(productsWithNeeds) + " prodotti coperti (" + String(coveragePercent) + "%) "}</Badge>
              </InlineStack>
              <ProgressBar
                progress={coveragePercent}
                tone={
                  coveragePercent === 100
                    ? "success"
                    : coveragePercent >= 50
                    ? "highlight"
                    : "critical"
                }
                size="small"
              />
            </BlockStack>
          </Card>
        )}

        {/* CONTENUTO A TABS */}
        <Card padding="0">
          <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
            <Box padding="400">
              {selectedTab === 0 && (
                <ProductsNeededTable
                  products={activeProducts.filter(p => !orderedProductIds.includes(p.productId))}
                  orderCount={orderCount}
                />
              )}
              {selectedTab === 1 && (
                <BlockStack gap="500">
                  <IncomingProductForm products={activeProducts} />
                  <Divider />
                  <IncomingProductList items={incomingItems} />
                </BlockStack>
              )}
              {selectedTab === 2 && (
                <DifferenceTable products={activeProducts} incomingMap={incomingMap} />
              )}
              {selectedTab === 3 && (
                <UnconfirmedCodList orders={unconfirmedCodOrders} />
              )}
              {selectedTab === 4 && (
                <TerminatedProductsList
                  terminatedProducts={outOfStockProducts}
                  affectedOrdersMap={affectedOrdersMap}
                />
              )}
              {selectedTab === 5 && <PackPlan products={packPlan} catalog={packCatalog} />}
              {selectedTab === 6 && <UnconfirmedCodList orders={followupOrders} mode="followup"/>}
            </Box>
          </Tabs>
        </Card>
      </BlockStack>
    </Page>
  );
}
