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
} from "@shopify/polaris";
import { RefreshIcon } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import { getAggregatedProducts } from "../services/orders.server";
import {
  getIncomingProducts,
  getAggregatedIncoming,
  addIncomingProduct,
  deleteIncomingProduct,
} from "../services/incoming.server";

import { ProductsNeededTable } from "../components/ProductsNeededTable";
import { IncomingProductForm } from "../components/IncomingProductForm";
import { IncomingProductList } from "../components/IncomingProductList";
import { DifferenceTable } from "../components/DifferenceTable";

// --- LOADER: carica dati ordini + merce in arrivo ---
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Carica in parallelo ordini aggregati e merce in arrivo
  const [orderData, incomingItems, incomingAggregated] = await Promise.all([
    getAggregatedProducts(admin),
    getIncomingProducts(shop),
    getAggregatedIncoming(shop),
  ]);

  // Converti la Map in un oggetto serializzabile per il client
  const incomingMap: Record<string, number> = {};
  incomingAggregated.forEach((value, key) => {
    incomingMap[key] = value.totalQuantity;
  });

  return json({
    products: orderData.products,
    orderCount: orderData.orderCount,
    incomingItems,
    incomingMap,
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

    case "deleteIncoming": {
      const deleteId = formData.get("deleteId") as string;
      if (!deleteId) {
        return json({ error: "ID mancante" }, { status: 400 });
      }

      await deleteIncomingProduct(deleteId, shop);
      return json({ success: true });
    }

    default:
      return json({ error: "Azione non riconosciuta" }, { status: 400 });
  }
};

// --- PAGINA PRINCIPALE ---
export default function OrderManagerIndex() {
  const { products, orderCount, incomingItems, incomingMap, lastUpdated } =
    useLoaderData<typeof loader>();

  const navigation = useNavigation();
  const isRefreshing = navigation.state === "loading";

  const formattedLastUpdated = new Date(lastUpdated).toLocaleTimeString(
    "it-IT",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }
  );

  return (
    <Page
      title="Gestione Ordini da Evadere"
      subtitle={`Ultimo aggiornamento: ${formattedLastUpdated}`}
      primaryAction={
        <Button
          icon={RefreshIcon}
          loading={isRefreshing}
          onClick={() => {
            // Ricarica la pagina per aggiornare i dati
            window.location.reload();
          }}
        >
          Aggiorna
        </Button>
      }
    >
      <BlockStack gap="500">
        {/* Layout a due colonne */}
        <Layout>
          {/* COLONNA SINISTRA: Prodotti necessari */}
          <Layout.Section>
            <ProductsNeededTable
              products={products}
              orderCount={orderCount}
            />
          </Layout.Section>

          {/* COLONNA DESTRA: Merce in arrivo */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <IncomingProductForm products={products} />
              <IncomingProductList items={incomingItems} />
            </BlockStack>
          </Layout.Section>
        </Layout>

        {/* TABELLA DIFFERENZE (sotto le due colonne) */}
        <DifferenceTable products={products} incomingMap={incomingMap} />
      </BlockStack>
    </Page>
  );
}
