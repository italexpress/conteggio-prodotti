import {
  Card,
  IndexTable,
  Text,
  TextField,
  Badge,
  BlockStack,
  InlineStack,
  Box,
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
            0
          </Text>
        )}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingMd" as="h2">
            Prodotti necessari per evadere gli ordini
          </Text>
          <InlineStack gap="200">
            <Badge tone="info">{orderCount} ordini aperti</Badge>
            <Badge tone="warning">{totalCod} in contrassegno</Badge>
            <Badge>{totalItems} pezzi totali</Badge>
          </InlineStack>
        </InlineStack>

        <TextField
          label=""
          labelHidden
          value={searchValue}
          onChange={setSearchValue}
          placeholder="Cerca prodotto..."
          clearButton
          onClearButtonClick={() => setSearchValue("")}
          autoComplete="off"
        />

        {filteredProducts.length > 0 ? (
          <IndexTable
            itemCount={filteredProducts.length}
            headings={[
              { title: "Prodotto" },
              { title: "Quantità totale" },
              { title: "Di cui contrassegno" },
            ]}
            selectable={false}
          >
            {rowMarkup}
          </IndexTable>
        ) : (
          <Box padding="400">
            <Text as="p" alignment="center" tone="subdued">
              {searchValue
                ? "Nessun prodotto trovato per la ricerca"
                : "Nessun ordine da evadere 🎉"}
            </Text>
          </Box>
        )}
      </BlockStack>
    </Card>
  );
}
