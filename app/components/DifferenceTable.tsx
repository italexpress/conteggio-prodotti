import {
  IndexTable,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  ProgressBar,
  EmptyState,
} from "@shopify/polaris";
import { useMemo } from "react";
import type { AggregatedProduct } from "../services/orders.server";

interface DifferenceRow {
  variantId: string;
  displayName: string;
  needed: number;
  incoming: number;
  missing: number;
  surplus: number;
  status: "critical" | "success" | "warning";
  coveragePercent: number;
}

interface DifferenceTableProps {
  products: AggregatedProduct[];
  incomingMap: Record<string, number>; // variantId -> total incoming quantity
}

export function DifferenceTable({
  products,
  incomingMap,
}: DifferenceTableProps) {
  const rows: DifferenceRow[] = useMemo(() => {
    return products
      .filter((p) => {
        const incoming = incomingMap[p.variantId] || 0;
        return p.totalQuantity > 0 || incoming > 0;
      })
      .map((p) => {
        const incoming = incomingMap[p.variantId] || 0;
        const missing = Math.max(0, p.totalQuantity - incoming);
        const surplus = Math.max(0, incoming - p.totalQuantity);

        let status: "critical" | "success" | "warning";
        if (missing > 0) {
          status = "critical";
        } else if (surplus > 0) {
          status = "success";
        } else {
          status = "success";
        }

        const coveragePercent =
          p.totalQuantity > 0
            ? Math.min(100, Math.round((incoming / p.totalQuantity) * 100))
            : 100;

        return {
          variantId: p.variantId,
          displayName: p.displayName,
          needed: p.totalQuantity,
          incoming,
          missing,
          surplus,
          status,
          coveragePercent,
        };
      })
      .sort((a, b) => b.missing - a.missing || b.needed - a.needed);
  }, [products, incomingMap]);

  const hasAnyIncoming = Object.keys(incomingMap).length > 0;
  if (!hasAnyIncoming) {
    return (
      <EmptyState
        heading="Nessun confronto disponibile"
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>
          Registra della merce in arrivo nella scheda "🚚 Merce in arrivo" per
          vedere il confronto con gli ordini.
        </p>
      </EmptyState>
    );
  }

  const criticalCount = rows.filter((r) => r.status === "critical").length;
  const coveredCount = rows.filter((r) => r.missing === 0).length;

  const rowMarkup = rows.map((row, index) => {
    return (
      <IndexTable.Row
        id={row.variantId}
        key={row.variantId}
        position={index}
      >
        <IndexTable.Cell>
          <InlineStack gap="200" blockAlign="center">
            <Text variant="bodyMd" as="span">
              {row.status === "critical" ? "🔴" : "🟢"}
            </Text>
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              {row.displayName}
            </Text>
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {row.needed}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {row.incoming}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Box minInlineSize="120px">
            <BlockStack gap="100">
              <ProgressBar
                progress={row.coveragePercent}
                tone={row.status === "critical" ? "critical" : "success"}
                size="small"
              />
              <Text variant="bodySm" as="span" tone="subdued">
                {row.coveragePercent}%
              </Text>
            </BlockStack>
          </Box>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200" blockAlign="center">
            {row.missing > 0 ? (
              <Badge tone="critical">−{row.missing} mancanti</Badge>
            ) : (
              <Badge tone="success">✓ Coperto</Badge>
            )}
            {row.surplus > 0 && (
              <Badge tone="success">+{row.surplus} extra</Badge>
            )}
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center">
        <Text variant="headingSm" as="h3">
          Confronto ordini vs merce in arrivo
        </Text>
        <InlineStack gap="200">
          {criticalCount > 0 && (
            <Badge tone="critical">{criticalCount} da ordinare</Badge>
          )}
          {coveredCount > 0 && (
            <Badge tone="success">{coveredCount} coperti</Badge>
          )}
        </InlineStack>
      </InlineStack>

      {criticalCount > 0 && (
        <Banner tone="warning">
          <p>
            Hai <strong>{criticalCount} prodotti</strong> per cui la merce in
            arrivo non è sufficiente a coprire gli ordini aperti.
          </p>
        </Banner>
      )}

      {criticalCount === 0 && rows.length > 0 && (
        <Banner tone="success">
          <p>
            Tutti i prodotti con merce in arrivo sono coperti! 🎉
          </p>
        </Banner>
      )}

      <IndexTable
        itemCount={rows.length}
        headings={[
          { title: "Prodotto" },
          { title: "Necessari" },
          { title: "In arrivo" },
          { title: "Copertura" },
          { title: "Stato" },
        ]}
        selectable={false}
      >
        {rowMarkup}
      </IndexTable>
    </BlockStack>
  );
}
