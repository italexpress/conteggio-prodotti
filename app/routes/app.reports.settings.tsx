import { json } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, Text, TextField, Button, InlineStack, Banner,
} from "@shopify/polaris";
import { useState } from "react";
import { SaveIcon } from "@shopify/polaris-icons";

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
    if (key === "intent") continue;
    if (key === "metaAccessToken" || key === "metaAdAccountId") {
      updates[key] = value as string || null;
    } else {
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

  const s = (key: string) => String((settings as any)[key] ?? "");

  const [form, setForm] = useState({
    shippingRevenue: s("shippingRevenue"),
    shippingCost: s("shippingCost"),
    codFeeCharged: s("codFeeCharged"),
    codCost: s("codCost"),
    freeShippingThreshold: s("freeShippingThreshold"),
    returnShipmentCost: s("returnShipmentCost"),
    resoClienteShippingCost: s("resoClienteShippingCost"),
    resoRimborsoRevenue: s("resoRimborsoRevenue"),
    resoRimborsoCost: s("resoRimborsoCost"),
    resoExchangeRevenue: s("resoExchangeRevenue"),
    resoExchangeCost: s("resoExchangeCost"),
    shopifyFeePercent: s("shopifyFeePercent"),
    shopifyFeeFixed: s("shopifyFeeFixed"),
    paypalFeePercent: s("paypalFeePercent"),
    paypalFeeFixed: s("paypalFeeFixed"),
    vatPercent: s("vatPercent"),
  });

  const ch = (f: string) => (v: string) => setForm(p => ({ ...p, [f]: v }));

  const handleSave = () => {
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    fd.append("intent", "save");
    submit(fd, { method: "post" });
  };

  const F = ({ label, field, help }: { label: string; field: string; help?: string }) => (
    <TextField label={label} type="number" value={(form as any)[field]} onChange={ch(field)} autoComplete="off" helpText={help} />
  );

  return (
    <Page backAction={{ content: "Dashboard", url: "/app/reports" }} title="Impostazioni Dashboard"
      primaryAction={<Button variant="primary" icon={SaveIcon} onClick={handleSave} loading={isSaving}>Salva</Button>}>
      <BlockStack gap="500">
        <Banner tone="info">Tutti i valori sono utilizzati per calcolare il profitto. Le modifiche si applicano immediatamente a tutti i calcoli.</Banner>

        <Layout>
          {/* LOGISTICA */}
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">🚚 Logistica</Text>
                <F label="Shipping Revenue — quanto paga il cliente (€)" field="shippingRevenue" help="Es. 6.50€" />
                <F label="Shipping Cost — costo reale spedizione (€)" field="shippingCost" help="Es. 4.27€ (IVA inclusa)" />
                <F label="COD Fee addebitata al cliente (€)" field="codFeeCharged" help="Es. 4.90€" />
                <F label="COD Cost — costo reale contrassegno (€)" field="codCost" help="Es. 5.73€ (IVA inclusa)" />
                <F label="Soglia Spedizione Gratuita (€)" field="freeShippingThreshold" help="Ordini sopra questa soglia = free shipping" />
                <F label="Costo spedizione ritorno merce (€)" field="returnShipmentCost" help="Per RITORNO_MERCE (IVA inclusa)" />
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* COMMISSIONI */}
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">💳 Commissioni Pagamento</Text>
                <InlineStack gap="400">
                  <F label="Shopify Payments (%)" field="shopifyFeePercent" />
                  <F label="Shopify Fisso (€)" field="shopifyFeeFixed" />
                </InlineStack>
                <InlineStack gap="400">
                  <F label="PayPal (%)" field="paypalFeePercent" />
                  <F label="PayPal Fisso (€)" field="paypalFeeFixed" />
                </InlineStack>
                <Divider />
                <Text variant="headingMd" as="h3">🧾 Tassazione</Text>
                <F label="Aliquota IVA (%)" field="vatPercent" help="Per scorporare IVA dai ricavi" />
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* RESI */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">📦 Gestione Resi</Text>
                <Layout>
                  <Layout.Section variant="oneThird">
                    <BlockStack gap="300">
                      <Text variant="headingSm" as="h4">RESO_CLIENTE_SPEDISCE</Text>
                      <F label="Costo spedizione sostitutivo (€)" field="resoClienteShippingCost" help="L'azienda paga solo la spedizione del sostitutivo" />
                    </BlockStack>
                  </Layout.Section>
                  <Layout.Section variant="oneThird">
                    <BlockStack gap="300">
                      <Text variant="headingSm" as="h4">RESO_RIMBORSO_RITIRO</Text>
                      <F label="Quanto paga il cliente (€)" field="resoRimborsoRevenue" help="Es. 9.00€" />
                      <F label="Costo reale ritiro (€)" field="resoRimborsoCost" help="Es. 5.00€" />
                    </BlockStack>
                  </Layout.Section>
                  <Layout.Section variant="oneThird">
                    <BlockStack gap="300">
                      <Text variant="headingSm" as="h4">RESO_EXCHANGE</Text>
                      <F label="Quanto paga il cliente (€)" field="resoExchangeRevenue" help="Es. 11.00€" />
                      <F label="Costo reale cambio (€)" field="resoExchangeCost" help="Es. 7.00€" />
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
  return <div style={{ height: 1, background: "var(--p-color-border)", margin: "16px 0" }} />;
}
