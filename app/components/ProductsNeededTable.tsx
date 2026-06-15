import {
  IndexTable,
  Text,
  TextField,
  Badge,
  BlockStack,
  InlineStack,
  Box,
  EmptyState,
} from "@shopify/polaris";
import { useState, useMemo } from "react";
import type { AggregatedProduct } from "../services/orders.server";

interface ProductsNeededTableProps {
  products: AggregatedProduct[];
  orderCount: number;
}

export function ProductsNeededTable({
  products,
  orderCount,
}: ProductsNeededTableProps) {
  const [searchValue, setSearchValue] = useState("");

  const filteredProducts = useMemo(() => {
    if (!searchValue.trim()) return products;
    const search = searchValue.toLowerCase();
    return products.filter((p) =>
      p.displayName.toLowerCase().includes(search)
    );
  }, [products, searchValue]);

  const totalItems = filteredProducts.reduce(
    (sum, p) => sum + p.totalQuantity,
    0
  );

  const totalCod = filteredProducts.reduce(
    (sum, p) => sum + p.codQuantity,
    0
  );

  const rowMarkup = filteredProducts.map((product, index) => (
    <IndexTable.Row
      id={product.variantId}
      key={product.variantId}
      position={index}
    >
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="semibold" as="span">
          {product.displayName}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone="attention" size="medium">
          {String(product.totalQuantity)}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {product.codQuantity > 0 ? (
          <Badge tone="warning" size="medium">
            {String(product.codQuantity)}
          </Badge>
        ) : (
          <Text variant="bodyMd" as="span" tone="subdued">
            —
          </Text>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {product.codAcceptedQuantity > 0 ? (
          <Badge tone="success" size="medium">
            ✅ {String(product.codAcceptedQuantity)}
          </Badge>
        ) : product.codQuantity > 0 ? (
          <Badge tone="critical" size="medium">
            ✗ 0
          </Badge>
        ) : (
          <Text variant="bodyMd" as="span" tone="subdued">
            —
          </Text>
        )}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  if (products.length === 0) {
    return (
      <EmptyState
        heading="Nessun ordine da evadere 🎉"
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>Tutti gli ordini sono stati evasi. Ottimo lavoro!</p>
      </EmptyState>
    );
  }

  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center">
        <Text variant="headingSm" as="h3">
          Lista prodotti da preparare
        </Text>
        <InlineStack gap="200">
          <Badge>{filteredProducts.length} prodotti</Badge>
          <Badge tone="attention">{totalItems} pz totali</Badge>
          {totalCod > 0 && (
            <Badge tone="warning">{totalCod} in contrassegno</Badge>
          )}
        </InlineStack>
      </InlineStack>

      <TextField
        label=""
        labelHidden
        value={searchValue}
        onChange={setSearchValue}
        placeholder="🔍 Cerca prodotto..."
        clearButton
        onClearButtonClick={() => setSearchValue("")}
        autoComplete="off"
      />

      {filteredProducts.length > 0 ? (
        <IndexTable
          itemCount={filteredProducts.length}
          headings={[
            { title: "Prodotto" },
            { title: "Quantità" },
            { title: "Contrassegno" },
            { title: "COD Accettati" },
          ]}
          selectable={false}
        >
          {rowMarkup}
        </IndexTable>
      ) : (
        <Box padding="400">
          <Text as="p" alignment="center" tone="subdued">
            Nessun prodotto trovato per "{searchValue}"
          </Text>
        </Box>
      )}
    </BlockStack>
  );
}
