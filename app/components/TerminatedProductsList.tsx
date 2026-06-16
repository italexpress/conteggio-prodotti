import {
  IndexTable,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  EmptyState,
  Button,
} from "@shopify/polaris";
import { useState } from "react";
import { useFetcher } from "@remix-run/react";
import type { AffectedOrder } from "../services/orders.server";

export interface OutOfStockProductData {
  id: string;
  variantId: string;
  displayName: string;
}

interface TerminatedProductsListProps {
  terminatedProducts: OutOfStockProductData[];
  affectedOrdersMap: Record<string, AffectedOrder[]>;
}

export function TerminatedProductsList({
  terminatedProducts,
  affectedOrdersMap,
}: TerminatedProductsListProps) {
  const fetcher = useFetcher();
  const [expandedVariantId, setExpandedVariantId] = useState<string | null>(null);

  if (terminatedProducts.length === 0) {
    return (
      <EmptyState
        heading="Nessun prodotto terminato 📦"
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>Non hai segnato nessun prodotto come fuori stock.</p>
      </EmptyState>
    );
  }

  const rowMarkup = terminatedProducts.map((product, index) => {
    const isExpanded = expandedVariantId === product.variantId;
    const affectedOrders = affectedOrdersMap[product.variantId] || [];
    
    // Sort orders by oldest first (critical)
    const sortedOrders = [...affectedOrders].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const totalNeeded = affectedOrders.reduce((sum, o) => sum + o.quantity, 0);

    const isRestoring =
      fetcher.state === "submitting" &&
      fetcher.formData?.get("intent") === "removeOutOfStock" &&
      fetcher.formData?.get("id") === product.id;

    return (
      <IndexTable.Row
        id={product.variantId}
        key={product.variantId}
        position={index}
        onClick={() => setExpandedVariantId(isExpanded ? null : product.variantId)}
      >
        <IndexTable.Cell>
          <BlockStack gap="100">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="bodyMd" fontWeight="bold" as="span">
                {product.displayName}
              </Text>
              <InlineStack gap="200" blockAlign="center">
                <Badge tone="critical">{affectedOrders.length} ordini bloccati</Badge>
                <Badge tone="warning">{totalNeeded} pezzi richiesti</Badge>
                <Button
                  size="micro"
                  onClick={(e) => {
                    e.stopPropagation();
                    fetcher.submit(
                      { intent: "removeOutOfStock", id: product.id },
                      { method: "post" }
                    );
                  }}
                  loading={isRestoring}
                >
                  Riattiva
                </Button>
              </InlineStack>
            </InlineStack>

            {isExpanded && (
              <Box paddingBlockStart="200">
                {sortedOrders.length > 0 ? (
                  <div style={{ background: "rgba(0,0,0,0.02)", padding: "12px", borderRadius: "8px" }}>
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h4">Ordini da contattare:</Text>
                      {sortedOrders.map((order) => {
                        const daysAgo = Math.floor(
                          (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24)
                        );
                        const urgencyTone = daysAgo >= 3 ? "critical" : daysAgo >= 1 ? "warning" : "info";

                        return (
                          <InlineStack key={order.id} align="space-between" blockAlign="center">
                            <InlineStack gap="200" blockAlign="center">
                              <Text variant="bodyMd" fontWeight="semibold" as="span">{order.name}</Text>
                              <Text variant="bodySm" as="span" tone="subdued">{order.customerName}</Text>
                            </InlineStack>
                            <InlineStack gap="200" blockAlign="center">
                              <Badge>{order.quantity} pz</Badge>
                              <Badge tone={urgencyTone}>
                                {daysAgo === 0 ? "Oggi" : `${daysAgo} gg fa`}
                              </Badge>
                              <Button
                                size="micro"
                                url={`shopify:admin/orders/${order.id.split("/").pop()}`}
                                target="_blank"
                              >
                                Apri
                              </Button>
                            </InlineStack>
                          </InlineStack>
                        );
                      })}
                    </BlockStack>
                  </div>
                ) : (
                  <Text variant="bodySm" as="span" tone="subdued">
                    Nessun ordine attivo trovato per questo prodotto.
                  </Text>
                )}
              </Box>
            )}
          </BlockStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center">
        <Text variant="headingSm" as="h3">
          Prodotti Fuori Stock
        </Text>
        <Badge tone="critical">{terminatedProducts.length} prodotti terminati</Badge>
      </InlineStack>

      <Banner tone="critical">
        <p>
          Questi prodotti sono stati segnati come esauriti. Clicca su un prodotto per vedere 
          tutti gli ordini che lo contengono e contattare i clienti per un cambio.
        </p>
      </Banner>

      <IndexTable
        itemCount={terminatedProducts.length}
        headings={[
          { title: "Prodotto Terminato" }
        ]}
        selectable={false}
      >
        {rowMarkup}
      </IndexTable>
    </BlockStack>
  );
}
