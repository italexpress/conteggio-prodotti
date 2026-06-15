import {
  Card,
  ResourceList,
  ResourceItem,
  Text,
  Badge,
  InlineStack,
  Button,
  BlockStack,
  Box,
  Divider,
} from "@shopify/polaris";
import { useFetcher } from "@remix-run/react";
import type { IncomingProductData } from "../services/incoming.server";

interface IncomingProductListProps {
  items: IncomingProductData[];
}

export function IncomingProductList({ items }: IncomingProductListProps) {
  const fetcher = useFetcher();

  if (items.length === 0) {
    return (
      <Card>
        <BlockStack gap="300">
          <Text variant="headingMd" as="h2">
            Merce registrata
          </Text>
          <Box padding="400">
            <Text as="p" alignment="center" tone="subdued">
              Nessuna merce in arrivo registrata.
            </Text>
          </Box>
        </BlockStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h2">
          Merce registrata ({items.length})
        </Text>
        <Divider />
        <ResourceList
          items={items}
          renderItem={(item) => {
            const isDeleting =
              fetcher.state === "submitting" &&
              fetcher.formData?.get("deleteId") === item.id;

            return (
              <ResourceItem
                id={item.id}
                accessibilityLabel={`Merce in arrivo: ${item.displayName}`}
              >
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="bodyMd" fontWeight="semibold" as="span">
                      {item.displayName}
                    </Text>
                    <InlineStack gap="200">
                      <Badge tone="info">{item.quantity} pz</Badge>
                      {item.expectedArrivalDate && (
                        <Badge>
                          Arrivo:{" "}
                          {new Date(
                            item.expectedArrivalDate
                          ).toLocaleDateString("it-IT", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </Badge>
                      )}
                    </InlineStack>
                  </BlockStack>
                  <Button
                    variant="plain"
                    tone="critical"
                    onClick={() => {
                      fetcher.submit(
                        { intent: "deleteIncoming", deleteId: item.id },
                        { method: "post" }
                      );
                    }}
                    loading={isDeleting}
                  >
                    Elimina
                  </Button>
                </InlineStack>
              </ResourceItem>
            );
          }}
        />
      </BlockStack>
    </Card>
  );
}
