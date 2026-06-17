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
  Banner,
} from "@shopify/polaris";
import { CalendarIcon } from "@shopify/polaris-icons";
import { useState, useCallback, useMemo, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import type { AggregatedProduct } from "../services/orders.server";

interface IncomingProductFormProps {
  products: AggregatedProduct[];
}

export function IncomingProductForm({ products }: IncomingProductFormProps) {
  const submitFetcher = useFetcher();
  const variantsFetcher = useFetcher();
  const isSubmitting = submitFetcher.state === "submitting";
  const [showSuccess, setShowSuccess] = useState(false);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  
  const [datePopoverActive, setDatePopoverActive] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [{ month, year }, setDate] = useState({
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
  });

  // Trova tutti i prodotti unici tra quelli che sono richiesti negli ordini aperti
  const uniqueProducts = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach(p => {
      if (!map.has(p.productId)) {
        map.set(p.productId, p.productTitle);
      }
    });
    
    const options = Array.from(map.entries()).map(([id, title]) => ({
      label: title,
      value: id,
    }));
    
    // Ordiniamo alfabeticamente per facilitare la ricerca
    options.sort((a, b) => a.label.localeCompare(b.label));
    
    return [{ label: "Seleziona un prodotto...", value: "" }, ...options];
  }, [products]);

  // Carica le varianti (taglie) quando si seleziona un prodotto
  useEffect(() => {
    if (selectedProductId) {
      variantsFetcher.load(`/app/api/product-variants?productId=${encodeURIComponent(selectedProductId)}`);
      setQuantities({}); // reset quantities
    }
  }, [selectedProductId]);

  const fetchedData = variantsFetcher.data as any;
  const variants = fetchedData?.variants || [];
  const isLoadingVariants = variantsFetcher.state === "loading";

  const handleQuantityChange = useCallback((variantId: string, value: string) => {
    setQuantities(prev => ({
      ...prev,
      [variantId]: value,
    }));
  }, []);

  const handleSubmit = useCallback(() => {
    const itemsToSubmit = variants
      .map((v: any) => ({
        productId: selectedProductId,
        variantId: v.id,
        productTitle: fetchedData.productTitle,
        variantTitle: v.title,
        displayName: v.displayName,
        quantity: parseInt(quantities[v.id] || "0", 10),
        expectedArrivalDate: selectedDate ? selectedDate.toISOString().split("T")[0] : "",
      }))
      .filter((item: any) => item.quantity > 0);

    if (itemsToSubmit.length === 0) return;

    submitFetcher.submit(
      {
        intent: "addIncomingBatch",
        batchData: JSON.stringify(itemsToSubmit),
      },
      { method: "post" }
    );

    // Reset form
    setSelectedProductId("");
    setQuantities({});
    setSelectedDate(null);
    
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  }, [variants, quantities, selectedProductId, fetchedData, selectedDate, submitFetcher]);

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

  const hasAnyQuantity = Object.values(quantities).some(q => parseInt(q || "0", 10) > 0);

  return (
    <BlockStack gap="400">
      <Text variant="headingSm" as="h3">
        ➕ Registra Ordine Fornitore
      </Text>

      <Text as="p" tone="subdued">
        Seleziona un modello tra quelli che hanno scorte mancanti negli ordini, e inserisci le quantità ordinate per ciascuna taglia/variante.
      </Text>

      {showSuccess && (
        <Banner tone="success" onDismiss={() => setShowSuccess(false)}>
          <p>Ordine fornitore registrato con successo! ✅</p>
        </Banner>
      )}

      <Select
        label="Modello Prodotto"
        options={uniqueProducts}
        value={selectedProductId}
        onChange={setSelectedProductId}
      />

      {isLoadingVariants && <Text as="p" tone="subdued">Caricamento taglie in corso...</Text>}

      {!isLoadingVariants && variants.length > 0 && selectedProductId && (
        <Card background="bg-surface-secondary">
          <BlockStack gap="300">
            <Text variant="headingSm" as="h4">Inserisci quantità in arrivo</Text>
            <div style={{ display: "grid", gap: "10px" }}>
              {variants.map((v: any) => {
                // Calcoliamo se questa specifica taglia è tra quelle "mancanti" per dare un aiuto visivo
                const neededProduct = products.find(p => p.variantId === v.id);
                const neededAmount = neededProduct ? neededProduct.totalQuantity : 0;
                
                return (
                  <InlineStack key={v.id} align="space-between" blockAlign="center">
                    <BlockStack gap="0">
                      <Text as="span" fontWeight="bold">{v.title}</Text>
                      {neededAmount > 0 && (
                        <Text as="span" tone="critical" variant="bodySm">
                          Ne servono: {neededAmount}
                        </Text>
                      )}
                    </BlockStack>
                    <div style={{ maxWidth: 100 }}>
                      <TextField
                        label="quantità"
                        labelHidden
                        type="number"
                        min={0}
                        value={quantities[v.id] || ""}
                        onChange={(val) => handleQuantityChange(v.id, val)}
                        autoComplete="off"
                        placeholder="0"
                      />
                    </div>
                  </InlineStack>
                );
              })}
            </div>
          </BlockStack>
        </Card>
      )}

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
          disabled={!selectedProductId || !hasAnyQuantity}
        >
          ➕ Salva Ordine
        </Button>
      </InlineStack>
    </BlockStack>
  );
}
