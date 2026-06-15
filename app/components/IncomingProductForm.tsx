import {
  Card,
  BlockStack,
  TextField,
  Button,
  Text,
  InlineStack,
  Select,
  DatePicker,
  Popover,
  Icon,
} from "@shopify/polaris";
import { CalendarIcon } from "@shopify/polaris-icons";
import { useState, useCallback, useMemo } from "react";
import { useFetcher } from "@remix-run/react";
import type { AggregatedProduct } from "../services/orders.server";

interface IncomingProductFormProps {
  products: AggregatedProduct[];
}

export function IncomingProductForm({ products }: IncomingProductFormProps) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state === "submitting";

  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [datePopoverActive, setDatePopoverActive] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [{ month, year }, setDate] = useState({
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
  });

  // Opzioni per il select prodotto
  const productOptions = useMemo(() => {
    const options = products.map((p) => ({
      label: `${p.displayName} (servono: ${p.totalQuantity})`,
      value: p.variantId,
    }));
    return [{ label: "Seleziona un prodotto...", value: "" }, ...options];
  }, [products]);

  // Trova il prodotto selezionato
  const selectedProduct = useMemo(
    () => products.find((p) => p.variantId === selectedVariantId),
    [products, selectedVariantId]
  );

  const handleSubmit = useCallback(() => {
    if (!selectedProduct || !quantity || parseInt(quantity) <= 0) return;

    fetcher.submit(
      {
        intent: "addIncoming",
        productId: selectedProduct.productId,
        variantId: selectedProduct.variantId,
        productTitle: selectedProduct.productTitle,
        variantTitle: selectedProduct.variantTitle,
        displayName: selectedProduct.displayName,
        quantity,
        expectedArrivalDate: selectedDate
          ? selectedDate.toISOString().split("T")[0]
          : "",
      },
      { method: "post" }
    );

    // Reset form
    setSelectedVariantId("");
    setQuantity("");
    setSelectedDate(null);
  }, [selectedProduct, quantity, selectedDate, fetcher]);

  const handleMonthChange = useCallback(
    (month: number, year: number) => setDate({ month, year }),
    []
  );

  const handleDateSelection = useCallback(
    ({ start }: { start: Date; end: Date }) => {
      setSelectedDate(start);
      setDatePopoverActive(false);
    },
    []
  );

  const formattedDate = selectedDate
    ? selectedDate.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";

  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">
          Merce in arrivo
        </Text>

        <Text as="p" tone="subdued">
          Registra i prodotti già ordinati ai fornitori che non sono ancora
          arrivati.
        </Text>

        <Select
          label="Prodotto"
          options={productOptions}
          value={selectedVariantId}
          onChange={setSelectedVariantId}
        />

        <TextField
          label="Quantità in arrivo"
          type="number"
          value={quantity}
          onChange={setQuantity}
          min={1}
          autoComplete="off"
        />

        <Popover
          active={datePopoverActive}
          activator={
            <TextField
              label="Data prevista arrivo (opzionale)"
              value={formattedDate}
              onFocus={() => setDatePopoverActive(true)}
              autoComplete="off"
              prefix={<Icon source={CalendarIcon} />}
              placeholder="Seleziona una data..."
              readOnly
            />
          }
          onClose={() => setDatePopoverActive(false)}
          preferredAlignment="left"
        >
          <div style={{ padding: "16px" }}>
            <DatePicker
              month={month}
              year={year}
              onChange={handleDateSelection}
              onMonthChange={handleMonthChange}
              selected={selectedDate || undefined}
              disableDatesBefore={new Date()}
            />
          </div>
        </Popover>

        <InlineStack align="end">
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={!selectedVariantId || !quantity || parseInt(quantity) <= 0}
          >
            Aggiungi
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
