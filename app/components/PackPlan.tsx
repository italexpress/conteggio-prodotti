import { useFetcher, useSearchParams } from "@remix-run/react";
import { BlockStack, Select, Text, Button, Checkbox, TextField } from "@shopify/polaris";
import { useState } from "react";
import type { getPackPlan } from "../services/packs.server";
import { summarizePacks } from "../services/packs";
import styles from './PackPlan.module.css';

type Product = Awaited<ReturnType<typeof getPackPlan>>[number];
const sizeOrder = ['XXS','XS','S','M','L','XL','XXL','XXXL'];

function ProductPack({ product }: { product: Product }) {
  const fetcher = useFetcher<{ error?: string; success?: boolean }>();
  const selected = product.options.includes(product.selected) ? product.selected : "";
  const codes = [...new Set(product.groups.flatMap(g => g.variants.map(v => v.sku)).filter(Boolean))];
  const busy = fetcher.state !== 'idle';
  return <tbody>
    <tr className={styles.productHeading}><th colSpan={4} scope="rowgroup">
      <div className={styles.headingLine}>
        <div className={styles.identity}>
          <span className={styles.title}>{product.title}</span>
          <span className={styles.code} title={codes.join(' · ')}>({codes[0] || 'Codice non indicato'}{codes.length > 1 ? ` +${codes.length - 1}` : ''} — {product.vendor || 'Fornitore non indicato'})</span>
        </div>
        <div className={styles.controls}>
          <div className={styles.composition}><Select label={`Composizione ${product.title}`} labelHidden value={selected}
            disabled={busy || product.options.length === 0}
            options={[{label:'Scegli composizione',value:''},...product.options.map(value=>({label:value,value}))]}
            onChange={composition=>{if(composition)fetcher.submit({intent:'savePack',productId:product.id,composition},{method:'post'})}}/></div>
          <Checkbox label="Ordinato" checked={product.ordered} disabled={busy}
            onChange={ordered=>fetcher.submit({intent:'setPackOrdered',productId:product.id,ordered:String(ordered)},{method:'post'})}/>
        </div>
      </div>
      {fetcher.data?.error && <div role="alert" className={styles.error}>{fetcher.data.error}</div>}
      {busy && <span role="status" className={styles.code}>Salvataggio…</span>}
      {product.options.length === 0 && <div className={styles.warning}>Nessuna composizione compatibile con le taglie Shopify.</div>}
    </th></tr>
    {product.groups.map(group=>{
      const plan=summarizePacks(group.variants,selected);
      const sold=Object.entries(plan.sold).sort(([a],[b])=>{
        const ai=sizeOrder.indexOf(a), bi=sizeOrder.indexOf(b);
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b);
      });
      return <tr key={group.name}>
        <td className={styles.color}>{group.name.replace(/^(colore|color|colour):\s*/i,'') || 'Unico'}</td>
        <td className={`${styles.packs} ${plan.count === 0 ? styles.muted : ''}`}>
          {plan.count === null ? <span className={styles.warning}>{plan.reason}</span> : `${plan.count} ${plan.count === 1 ? 'pacco' : 'pacchi'}`}
        </td>
        <td className={styles.remaining}>{plan.remaining === null ? '—' : `${plan.remaining} pz`}</td>
        <td className={styles.sold}><div className={styles.soldSizes}>{sold.length ? sold.map(([size,quantity])=><span key={size}><strong>{quantity}</strong>{size}</span>) : <span className={styles.muted}>0 pezzi</span>}</div></td>
      </tr>;
    })}
  </tbody>;
}

export function PackPlan({ products, catalog }: { products: Product[]; catalog: { hasNextPage: boolean; endCursor: string | null } | null }) {
  const [params,setParams]=useSearchParams();
  const [showOrdered,setShowOrdered]=useState(false);
  const [search,setSearch]=useState('');
  const term=search.trim().toLocaleLowerCase('it');
  const visibleProducts=products.filter(p=>p.ordered===showOrdered && (!term || [p.title,p.vendor,...p.groups.flatMap(g=>[g.name,...g.variants.map(v=>v.sku)])].join(' ').toLocaleLowerCase('it').includes(term)))
    .sort((a,b)=>a.title.localeCompare(b.title,'it',{numeric:true}));
  const navigateCatalog=(enabled:boolean,cursor?:string|null)=>{
    const next=new URLSearchParams(params);
    if(enabled)next.set('packCatalog','1');else next.delete('packCatalog');
    if(cursor)next.set('packCursor',cursor);else next.delete('packCursor');
    setParams(next);
  };
  return <BlockStack gap="200">
    <div className={styles.toolbar}>
      <Button size="micro" pressed={!showOrdered} onClick={()=>setShowOrdered(false)}>{`Da ordinare (${products.filter(p=>!p.ordered).length})`}</Button>
      <Button size="micro" pressed={showOrdered} onClick={()=>setShowOrdered(true)}>{`Ordinati (${products.filter(p=>p.ordered).length})`}</Button>
      <Button size="micro" pressed={Boolean(catalog)} onClick={()=>navigateCatalog(!catalog)}>{catalog?'Torna agli ordini':'Catalogo Shopify'}</Button>
      {catalog?.hasNextPage && <Button size="micro" onClick={()=>navigateCatalog(true,catalog.endCursor)}>Successivi</Button>}
      <div className={styles.search}><TextField label="Cerca prodotto, codice o fornitore" labelHidden placeholder="Cerca prodotto, codice o fornitore…" value={search} onChange={setSearch} autoComplete="off" clearButton onClearButtonClick={()=>setSearch('')}/></div>
    </div>
    <p className={styles.hint}>Vendute = quantità da evadere. Rimanenza = pezzi dei pacchi meno vendute. Giacenze escluse.</p>
    {visibleProducts.length ? <div className={styles.tableWrap}><table className={styles.table} aria-label="Lista acquisti per prodotto e colore">
      <thead><tr><th className={styles.color} scope="col">Colore</th><th className={styles.packs} scope="col">Pacchi necessari</th><th className={styles.remaining} scope="col">Rimanenza</th><th scope="col">Vendute per taglia</th></tr></thead>
      {visibleProducts.map(product=><ProductPack key={product.id} product={product}/>)}
    </table></div> : <Text as="p">{term?'Nessun prodotto corrisponde alla ricerca.':showOrdered?'Nessun prodotto segnato come ordinato.':'Nessun prodotto da ordinare.'}</Text>}
  </BlockStack>;
}
