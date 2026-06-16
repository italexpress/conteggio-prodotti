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
import type { UnconfirmedCodOrder } from "../services/orders.server";

interface UnconfirmedCodListProps {
  orders: UnconfirmedCodOrder[];
}

function UnconfirmedCodRow({
  order,
  index,
  isExpanded,
  onToggleExpanded,
}: {
  order: UnconfirmedCodOrder;
  index: number;
  isExpanded: boolean;
  onToggleExpanded: () => void;
}) {
  const fetcher = useFetcher();
  const isAccepting = fetcher.state !== "idle";

  const orderDate = new Date(order.createdAt).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const orderTime = new Date(order.createdAt).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const daysAgo = Math.floor(
    (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  const urgencyTone = daysAgo >= 3 ? "critical" : daysAgo >= 1 ? "warning" : "info";

  const location = [order.shippingCity, order.shippingProvince]
    .filter(Boolean)
    .join(", ");

  return (
    <IndexTable.Row
      id={order.id}
      key={order.id}
      position={index}
      onClick={onToggleExpanded}
    >
      <IndexTable.Cell>
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="bodyMd" fontWeight="bold" as="span">
              {order.name}
            </Text>
            <Badge tone={urgencyTone}>
              {daysAgo === 0
                ? "Oggi"
                : daysAgo === 1
                ? "Ieri"
                : `${daysAgo} giorni fa`}
            </Badge>
          </InlineStack>
          {isExpanded && (
            <Box paddingBlockStart="200">
              <BlockStack gap="100">
                {order.items.map((item, i) => (
                  <InlineStack key={i} gap="200">
                    <Text variant="bodySm" as="span" tone="subdued">
                      • {item.title}
                    </Text>
                    <Badge size="small">{item.quantity} pz</Badge>
                  </InlineStack>
                ))}
              </BlockStack>
            </Box>
          )}
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <BlockStack gap="100">
          <Text variant="bodyMd" fontWeight="semibold" as="span">
            {order.customerName}
          </Text>
          {location && (
            <Text variant="bodySm" as="span" tone="subdued">
              📍 {location}
            </Text>
          )}
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge>{order.itemCount} pz</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="semibold" as="span">
          €{parseFloat(order.totalPrice).toFixed(2)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <BlockStack gap="100">
          <Text variant="bodySm" as="span" tone="subdued">
            {orderDate}
          </Text>
          <Text variant="bodySm" as="span" tone="subdued">
            {orderTime}
          </Text>
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200" blockAlign="center">
          <Badge tone="critical">⏳ Da confermare</Badge>
          <div onClick={(e) => e.stopPropagation()}>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="acceptCod" />
              <input type="hidden" name="orderId" value={order.id} />
              <Button submit variant="primary" tone="success" loading={isAccepting}>
                Accetta
              </Button>
            </fetcher.Form>
          </div>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  );
}

export function UnconfirmedCodList({ orders }: UnconfirmedCodListProps) {
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  if (orders.length === 0) {
    return (
      <EmptyState
        heading="Tutti i contrassegni sono stati confermati! 🎉"
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>Non ci sono ordini in contrassegno in attesa di conferma.</p>
      </EmptyState>
    );
  }

  const totalValue = orders.reduce(
    (sum, o) => sum + parseFloat(o.totalPrice),
    0
  );
  const totalItems = orders.reduce((sum, o) => sum + o.itemCount, 0);

  const rowMarkup = orders.map((order, index) => {
    const isExpanded = expandedOrderId === order.id;
    return (
      <UnconfirmedCodRow
        key={order.id}
        order={order}
        index={index}
        isExpanded={isExpanded}
        onToggleExpanded={() => setExpandedOrderId(isExpanded ? null : order.id)}
      />
    );
  });

  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center">
        <Text variant="headingSm" as="h3">
          Ordini in contrassegno senza conferma
        </Text>
        <InlineStack gap="200">
          <Badge tone="critical">{orders.length} ordini</Badge>
          <Badge tone="warning">{totalItems} pezzi</Badge>
          <Badge>€{totalValue.toFixed(2)} totale</Badge>
        </InlineStack>
      </InlineStack>

      <Banner tone="warning">
        <p>
          Questi <strong>{orders.length} ordini</strong> sono in contrassegno
          ma <strong>non hanno il tag "ACCETTATO"</strong> su Shopify.
          Vai su Shopify, apri l'ordine e aggiungi il tag "ACCETTATO" per confermarli.
          Clicca su una riga per vedere i prodotti dell'ordine.
        </p>
      </Banner>

      <IndexTable
        itemCount={orders.length}
        headings={[
          { title: "Ordine" },
          { title: "Cliente" },
          { title: "Pezzi" },
          { title: "Totale" },
          { title: "Data" },
          { title: "Stato" },
        ]}
        selectable={false}
      >
        {rowMarkup}
      </IndexTable>
    </BlockStack>
  );
}
