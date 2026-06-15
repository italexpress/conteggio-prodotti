import {
  Card,
  IndexTable,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  Box,
  Banner,
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
        // Mostra solo righe dove c'è merce in arrivo O prodotti necessari
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

        return {
          variantId: p.variantId,
          displayName: p.displayName,
          needed: p.totalQuantity,
          incoming,
          missing,
          surplus,
          status,
        };
      })
      .sort((a, b) => b.missing - a.missing || b.needed - a.needed);
  }, [products, incomingMap]);

  // Non mostrare se non c'è merce in arrivo per nessun prodotto
  const hasAnyIncoming = Object.keys(incomingMap).length > 0;
  if (!hasAnyIncoming) return null;

  const criticalCount = rows.filter((r) => r.status === "critical").length;
  const coveredCount = rows.filter((r) => r.missing === 0).length;

  const rowMarkup = rows.map((row, index) => {
    // Stile riga colorata
    const rowStyle: React.CSSProperties = {
      backgroundColor:
        row.status === "critical"
          ? "rgba(228, 62, 62, 0.08)"
          : "rgba(46, 170, 78, 0.08)",
    };

    return (
      <IndexTable.Row
        id={row.variantId}
        key={row.variantId}
        position={index}
      >
        <IndexTable.Cell>
          <div style={rowStyle}>
            <Box padding="100">
              <Text variant="bodyMd" fontWeight="semibold" as="span">
                {row.status === "critical" ? "🔴 " : "🟢 "}
                {row.displayName}
              </Text>
            </Box>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div style={rowStyle}>
            <Box padding="100">
              <Text variant="bodyMd" as="span">
                {row.needed}
              </Text>
            </Box>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div style={rowStyle}>
            <Box padding="100">
              <Text variant="bodyMd" as="span">
                {row.incoming}
              </Text>
            </Box>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div style={rowStyle}>
            <Box padding="100">
              <InlineStack gap="200" blockAlign="center">
                {row.missing > 0 ? (
                  <Badge tone="critical">Mancanti: {row.missing}</Badge>
                ) : (
                  <Badge tone="success">Coperto</Badge>
                )}
                {row.surplus > 0 && (
                  <Badge tone="success">
                    Disponibilità futura: +{row.surplus}
                  </Badge>
                )}
              </InlineStack>
            </Box>
          </div>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingMd" as="h2">
            Riepilogo Differenze
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
            { title: "Stato" },
          ]}
          selectable={false}
        >
          {rowMarkup}
        </IndexTable>
      </BlockStack>
    </Card>
  );
}
