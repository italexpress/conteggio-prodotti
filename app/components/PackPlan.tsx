import { useFetcher } from "@remix-run/react";
import { Badge, BlockStack, Card, Select, Text, Banner } from "@shopify/polaris";
import type { getPackPlan } from "../services/packs.server";
import { minimumPacks } from "../services/packs";

function ProductPack({ product }: { product: Awaited<ReturnType<typeof getPackPlan>>[number] }) {
  const fetcher = useFetcher<{ error?: string; success?: boolean }>();
  const selected = product.options.includes(product.selected) ? product.selected : "";
  const plans = product.groups.map(group => minimumPacks(group.variants, selected));
  const total = plans.every(p => p.count !== null) ? plans.reduce((sum, p) => sum + p.count!, 0) : null;
  return <Card><BlockStack gap="300">
    <Text as="h3" variant="headingSm">{product.title}</Text>
    <Text as="p">Fornitore: {product.vendor || "Non indicato"}</Text>
    {total !== null && <Text as="p" fontWeight="bold">Totale prodotto: {total} pacchi interi</Text>}
    <Select label="Composizione del pacco" value={selected}
      disabled={fetcher.state !== "idle" || product.options.length === 0}
      options={[{ label: "Seleziona composizione", value: "" }, ...product.options.map(value => ({ label: value, value }))]}
      onChange={composition => { if (composition) fetcher.submit({ intent: "savePack", productId: product.id, composition }, { method: "post" }); }} />
    {product.options.length === 0 && <Banner tone="warning">Nessuna composizione compatibile con le varianti Shopify.</Banner>}
    {fetcher.data?.error && <Banner tone="critical">{fetcher.data.error}</Banner>}
    {fetcher.state !== "idle" && <Text as="p">Salvataggio…</Text>}
    {product.groups.map(group => {
      const plan = minimumPacks(group.variants, selected);
      return <BlockStack key={group.name} gap="200">
        {group.name && <Text as="h4" fontWeight="semibold">{group.name}</Text>}
        <Badge tone={plan.count === null ? "attention" : "success"}>{String(plan.count === null ? plan.reason! : `${plan.count} pacchi interi necessari`)}</Badge>
        {group.variants.map(v => <Text key={v.id} as="p">{v.size || "Taglia non identificata"} · Codice articolo: {v.sku || "Non indicato"} · Da evadere: {v.demand} · Giacenza: {v.stock === null ? "DA CONTARE" : v.stock}</Text>)}
      </BlockStack>;
    })}
  </BlockStack></Card>;
}

export function PackPlan({ products }: { products: Awaited<ReturnType<typeof getPackPlan>> }) {
  return <BlockStack gap="400">
    <Text as="h2" variant="headingMd">Pacchi per ordini PAGATI e contrassegni ACCETTATI</Text>
    <Text as="p">Scorte fisiche Shopify (on hand), merce in arrivo esclusa. Le giacenze non note richiedono un conteggio. Ogni colore viene calcolato separatamente.</Text>
    {products.map(p => <ProductPack key={p.id} product={p} />)}
  </BlockStack>;
}
