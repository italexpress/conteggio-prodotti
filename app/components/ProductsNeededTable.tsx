import {
  IndexTable,
  Text,
  TextField,
  Badge,
  BlockStack,
  InlineStack,
  Box,
  EmptyState,
  Select,
  ButtonGroup,
  Button,
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
  const [viewMode, setViewMode] = useState<"variants" | "grouped">("variants");
  const [sortValue, setSortValue] = useState("qty_desc");

  // 1. Applica filtro di ricerca
  const searchFilteredProducts = useMemo(() => {
    if (!searchValue.trim()) return products;
    const search = searchValue.toLowerCase();
    return products.filter((p) =>
      p.displayName.toLowerCase().includes(search) || 
      p.productTitle.toLowerCase().includes(search)
    );
  }, [products, searchValue]);

  // 2. Applica raggruppamento (Visuale Generale)
  const processedProducts = useMemo(() => {
    if (viewMode === "variants") {
      return [...searchFilteredProducts];
    }

    // Raggruppa per Prodotto (ignora taglia/variante)
    // Se i colori sono prodotti separati ("Valencia Caffe"), questo raggruppa ignorando le taglie.
    // Se il colore è la prima opzione della variante (es. "Caffè / XL"), proviamo a estrarre il colore.
    const groupMap = new Map<string, AggregatedProduct>();

    searchFilteredProducts.forEach((p) => {
      let groupKey = p.productId;
      let groupName = p.productTitle;

      // Gestione intelligente varianti: se la variante ha un "/", probabile sia "Colore / Taglia"
      if (p.variantTitle && p.variantTitle.includes("/")) {
        const color = p.variantTitle.split("/")[0].trim();
        groupKey = `${p.productId}-${color}`;
        groupName = `${p.productTitle} ${color}`;
      } else if (p.variantTitle && !p.productTitle.toLowerCase().includes(p.variantTitle.toLowerCase())) {
         // Se non c'è "/", assumiamo che variantTitle sia la taglia e la ignoriamo,
         // raggruppando tutto sotto productTitle (es. "Valencia Caffe")
         groupKey = p.productId;
         groupName = p.productTitle;
      }

      const existing = groupMap.get(groupKey);
      if (existing) {
        existing.totalQuantity += p.totalQuantity;
        existing.codQuantity += p.codQuantity;
        existing.codAcceptedQuantity += p.codAcceptedQuantity;
      } else {
        groupMap.set(groupKey, {
          ...p,
          variantId: groupKey, // mock ID
          displayName: groupName,
        });
      }
    });

    return Array.from(groupMap.values());
  }, [searchFilteredProducts, viewMode]);

  // 3. Applica Ordinamento
  const sortedProducts = useMemo(() => {
    return processedProducts.sort((a, b) => {
      switch (sortValue) {
        case "qty_desc":
          return b.totalQuantity - a.totalQuantity;
        case "qty_asc":
          return a.totalQuantity - b.totalQuantity;
        case "name_asc":
          return a.displayName.localeCompare(b.displayName);
        case "name_desc":
          return b.displayName.localeCompare(a.displayName);
        default:
          return 0;
      }
    });
  }, [processedProducts, sortValue]);

  const totalItems = sortedProducts.reduce(
    (sum, p) => sum + p.totalQuantity,
    0
  );

  const totalCod = sortedProducts.reduce(
    (sum, p) => sum + p.codQuantity,
    0
  );

  const rowMarkup = sortedProducts.map((product, index) => (
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

  const sortOptions = [
    { label: "Quantità (più alti prima)", value: "qty_desc" },
    { label: "Quantità (più bassi prima)", value: "qty_asc" },
    { label: "Nome (A-Z)", value: "name_asc" },
    { label: "Nome (Z-A)", value: "name_desc" },
  ];

  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center">
        <Text variant="headingSm" as="h3">
          Lista prodotti da preparare
        </Text>
        <InlineStack gap="200">
          <Badge>{sortedProducts.length} righe</Badge>
          <Badge tone="attention">{totalItems} pz totali</Badge>
          {totalCod > 0 && (
            <Badge tone="warning">{totalCod} in contrassegno</Badge>
          )}
        </InlineStack>
      </InlineStack>

      <InlineStack align="space-between" blockAlign="center">
        <ButtonGroup segmented>
          <Button
            pressed={viewMode === "variants"}
            onClick={() => setViewMode("variants")}
          >
            Dettagliato (con taglie)
          </Button>
          <Button
            pressed={viewMode === "grouped"}
            onClick={() => setViewMode("grouped")}
          >
            Generale (senza taglie)
          </Button>
        </ButtonGroup>

        <Select
          label="Ordina per"
          labelInline
          options={sortOptions}
          value={sortValue}
          onChange={setSortValue}
        />
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

      {sortedProducts.length > 0 ? (
        <IndexTable
          itemCount={sortedProducts.length}
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
