import { json } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit, Link as RemixLink } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  Button,
  InlineStack,
  Banner,
} from "@shopify/polaris";
import { useState } from "react";
import { ArrowLeftIcon, SaveIcon } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import { getSettings, updateSettings } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getSettings(session.shop);
  return json({ settings });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const updates: any = {};
  for (const [key, value] of formData.entries()) {
    if (key !== "intent") {
      updates[key] = parseFloat(value as string);
    }
  }

  await updateSettings(session.shop, updates);
  
  return json({ success: true });
};

export default function SettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [formState, setFormState] = useState({
    shippingCostOutbound: settings.shippingCostOutbound.toString(),
    shippingCostReturn: settings.shippingCostReturn.toString(),
    codManagementFee: settings.codManagementFee.toString(),
    returnRefundRevenue: settings.returnRefundRevenue.toString(),
    returnRefundCost: settings.returnRefundCost.toString(),
    returnExchangeRevenue: settings.returnExchangeRevenue.toString(),
    returnExchangeCost: settings.returnExchangeCost.toString(),
    shopifyFeePercent: settings.shopifyFeePercent.toString(),
    shopifyFeeFixed: settings.shopifyFeeFixed.toString(),
    paypalFeePercent: settings.paypalFeePercent.toString(),
    paypalFeeFixed: settings.paypalFeeFixed.toString(),
    vatPercent: settings.vatPercent.toString(),
    defaultShippingCost: settings.defaultShippingCost.toString(),
  });

  const handleChange = (field: string) => (value: string) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    const formData = new FormData();
    Object.entries(formState).forEach(([key, value]) => {
      formData.append(key, value);
    });
    formData.append("intent", "save");
    submit(formData, { method: "post" });
  };

  return (
    <Page
      backAction={{ content: 'Dashboard', url: '/app/reports' }}
      title="Impostazioni Calcolo Profitto"
      primaryAction={
        <Button variant="primary" icon={SaveIcon} onClick={handleSave} loading={isSaving}>
          Salva Impostazioni
        </Button>
      }
    >
      <BlockStack gap="500">
        <Banner tone="info">
          Tutti questi valori vengono utilizzati per calcolare il profitto netto in modo automatico.
          Qualsiasi modifica avrà effetto sui calcoli futuri e su quelli passati.
        </Banner>

        <Layout>
          {/* COSTI STANDARD E SPEDIZIONI */}
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Costi Standard di Spedizione</Text>
                
                <TextField
                  label="Costo spedizione ordine standard (€)"
                  type="number"
                  value={formState.defaultShippingCost}
                  onChange={handleChange("defaultShippingCost")}
                  autoComplete="off"
                  helpText="Quanto ti costa spedire un ordine in media"
                />

                <Divider />
                
                <Text variant="headingMd" as="h3">Ordini in Contrassegno</Text>
                <TextField
                  label="Spedizione andata contrassegno (€)"
                  type="number"
                  value={formState.shippingCostOutbound}
                  onChange={handleChange("shippingCostOutbound")}
                  autoComplete="off"
                />
                <TextField
                  label="Fee gestione contrassegno corriere (€)"
                  type="number"
                  value={formState.codManagementFee}
                  onChange={handleChange("codManagementFee")}
                  autoComplete="off"
                />
                <TextField
                  label="Spedizione ritorno in caso di rifiuto (€)"
                  type="number"
                  value={formState.shippingCostReturn}
                  onChange={handleChange("shippingCostReturn")}
                  autoComplete="off"
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* COMMISSIONI E IVA */}
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Commissioni di Pagamento</Text>
                
                <InlineStack gap="400">
                  <TextField
                    label="Shopify Payments (%)"
                    type="number"
                    value={formState.shopifyFeePercent}
                    onChange={handleChange("shopifyFeePercent")}
                    autoComplete="off"
                  />
                  <TextField
                    label="Shopify Fisso (€)"
                    type="number"
                    value={formState.shopifyFeeFixed}
                    onChange={handleChange("shopifyFeeFixed")}
                    autoComplete="off"
                  />
                </InlineStack>

                <InlineStack gap="400">
                  <TextField
                    label="PayPal (%)"
                    type="number"
                    value={formState.paypalFeePercent}
                    onChange={handleChange("paypalFeePercent")}
                    autoComplete="off"
                  />
                  <TextField
                    label="PayPal Fisso (€)"
                    type="number"
                    value={formState.paypalFeeFixed}
                    onChange={handleChange("paypalFeeFixed")}
                    autoComplete="off"
                  />
                </InlineStack>

                <Divider />

                <Text variant="headingMd" as="h3">Tassazione</Text>
                <TextField
                  label="Aliquota IVA %"
                  type="number"
                  value={formState.vatPercent}
                  onChange={handleChange("vatPercent")}
                  autoComplete="off"
                  helpText="Utilizzata per scorporare l'IVA dai ricavi ed estrapolare il netto"
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* GESTIONE RESI E CAMBI */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Gestione Resi e Cambi Merce</Text>
                
                <Layout>
                  <Layout.Section variant="oneHalf">
                    <Text variant="headingSm" as="h4">Reso con Rimborso</Text>
                    <BlockStack gap="300">
                      <TextField
                        label="Quanto paga il cliente per rendere? (€)"
                        type="number"
                        value={formState.returnRefundRevenue}
                        onChange={handleChange("returnRefundRevenue")}
                        autoComplete="off"
                        helpText="Es. 9.00€ trattenuti dal rimborso"
                      />
                      <TextField
                        label="Costo reale spedizione di reso per te (€)"
                        type="number"
                        value={formState.returnRefundCost}
                        onChange={handleChange("returnRefundCost")}
                        autoComplete="off"
                        helpText="Es. 5.00€ costo corriere"
                      />
                    </BlockStack>
                  </Layout.Section>

                  <Layout.Section variant="oneHalf">
                    <Text variant="headingSm" as="h4">Reso con Cambio Merce</Text>
                    <BlockStack gap="300">
                      <TextField
                        label="Quanto paga il cliente per il cambio? (€)"
                        type="number"
                        value={formState.returnExchangeRevenue}
                        onChange={handleChange("returnExchangeRevenue")}
                        autoComplete="off"
                        helpText="Es. 11.00€ incassati dal cliente"
                      />
                      <TextField
                        label="Costo reale per la spedizione di cambio (€)"
                        type="number"
                        value={formState.returnExchangeCost}
                        onChange={handleChange("returnExchangeCost")}
                        autoComplete="off"
                        helpText="Es. 7.00€ costo corriere"
                      />
                    </BlockStack>
                  </Layout.Section>
                </Layout>

              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--p-color-border)', margin: '16px 0' }} />;
}
