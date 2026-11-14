import { useFetcher, useSearchParams } from "@remix-run/react";
import { Badge, BlockStack, Card, Select, Text, Banner, Button, InlineStack, Checkbox } from "@shopify/polaris";
import { useState } from "react";
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
    <Checkbox label="Ordinato" helpText={product.ordered ? "Togli la spunta per rimettere il prodotto nella lista da ordinare." : "Spunta dopo aver ordinato il prodotto: verrà spostato in Ordinati."}
      checked={product.ordered} disabled={fetcher.state !== "idle"}
      onChange={ordered => fetcher.submit({ intent: "setPackOrdered", productId: product.id, ordered: String(ordered) }, { method: "post" })} />
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
        {group.variants.map(v => <Text key={v.id} as="p">{v.size || "Taglia non identificata"} · Codice articolo: {v.sku || "Non indicato"} · Da evadere: {v.demand}</Text>)}
      </BlockStack>;
    })}
  </BlockStack></Card>;
}

export function PackPlan({ products, catalog }: { products: Awaited<ReturnType<typeof getPackPlan>>; catalog: { hasNextPage: boolean; endCursor: string | null } | null }) {
  const [params, setParams] = useSearchParams();
  const [showOrdered, setShowOrdered] = useState(false);
  const visibleProducts = products.filter(p => p.ordered === showOrdered);
  const navigateCatalog = (enabled: boolean, cursor?: string | null) => {
    const next = new URLSearchParams(params);
    if (enabled) next.set('packCatalog', '1'); else next.delete('packCatalog');
    if (cursor) next.set('packCursor', cursor); else next.delete('packCursor');
    setParams(next);
  };
  return <BlockStack gap="400">
    <Text as="h2" variant="headingMd">Pacchi per ordini PAGATI e contrassegni ACCETTATI</Text>
    <InlineStack gap="200">
      <Button pressed={!catalog} onClick={() => navigateCatalog(false)}>Prodotti degli ordini</Button>
      <Button pressed={Boolean(catalog)} onClick={() => navigateCatalog(true)}>Tutti i prodotti Shopify</Button>
      {catalog?.hasNextPage && <Button onClick={() => navigateCatalog(true, catalog.endCursor)}>Prodotti successivi</Button>}
    </InlineStack>
    <InlineStack gap="200">
      <Button pressed={!showOrdered} onClick={() => setShowOrdered(false)}>{`Da ordinare (${products.filter(p => !p.ordered).length})`}</Button>
      <Button pressed={showOrdered} onClick={() => setShowOrdered(true)}>{`Ordinati (${products.filter(p => p.ordered).length})`}</Button>
    </InlineStack>
    {catalog && <Text as="p">Pagina del catalogo Shopify, fino a 20 prodotti. Puoi salvare la composizione anche prima di ricevere ordini.</Text>}
    <Text as="p">Pacchi calcolati sulle quantità da evadere, senza sottrarre giacenze o merce in arrivo. Ogni colore viene calcolato separatamente.</Text>
    {visibleProducts.length === 0 && <Text as="p">{showOrdered ? "Nessun prodotto segnato come ordinato in questa lista." : "Nessun prodotto da ordinare in questa lista."}</Text>}
    {visibleProducts.map(p => <ProductPack key={p.id} product={p} />)}
  </BlockStack>;
}
