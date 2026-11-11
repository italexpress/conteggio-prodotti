import { useMemo, useState, useEffect, useRef } from 'react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import { BlockStack, InlineStack, Text, TextField, Select, Button, Badge, Banner, Modal, DataTable, Card, Checkbox } from '@shopify/polaris';
import { variantGroup, groupKey, planPacks, packComposition, packOptions, type PackType } from '../services/pack-planning';
import type { AggregatedProduct } from '../services/orders.server';

const endpoint = '/app/api/purchasing';
const total = (values: Record<string, number>) => Object.values(values).reduce((a,b) => a+b,0);
const sizesText = (values: Record<string, number>) => Object.entries(values).filter(([,q]) => q > 0).map(([s,q]) => `${q} ${s}`).join(' · ') || '0 pezzi';

export function PurchasePlanner({ products, incomingMap, purchasing, catalogs }: {
  products: AggregatedProduct[]; incomingMap: Record<string,number>; purchasing: any; catalogs: Record<string,any>;
}) {
  const [search,setSearch] = useState('');
  const [supplierFilter,setSupplierFilter] = useState('');
  const [showOriginal,setShowOriginal] = useState(false);
  const [selected,setSelected] = useState<string | null>(null);
  const [supplier,setSupplier] = useState('');
  const [code,setCode] = useState('');
  const [notes,setNotes] = useState('');
  const [packType,setPackType] = useState<PackType>('assorted');
  const [packs,setPacks] = useState('');
  const [date,setDate] = useState('');
  const [physical,setPhysical] = useState<Record<string,string>>({});
  const [confirming,setConfirming] = useState(false);
  const [notice,setNotice] = useState('');
  const requestId = useRef('');
  const fetcher = useFetcher<any>();
  const revalidator = useRevalidator();
  const busy = fetcher.state !== 'idle';
  const groups = useMemo(() => {
    const map = new Map<string,any>();
    const stocks = Object.fromEntries(purchasing.stocks.map((s:any) => [s.variantId,s.quantity]));
    for (const product of products) {
      const catalog = catalogs[product.productId];
      const v = catalog?.variants.find((v:any) => v.id === product.variantId);
      const options = v || variantGroup(product.variantTitle);
      const key = groupKey(product.productId,options.colorKey);
      let g = map.get(key);
      if (!g) {
        const variants = catalog?.variants.filter((v:any) => v.colorKey === options.colorKey) || [];
        const profile = purchasing.profiles.find((p:any) => p.groupKey === key);
        g = { key, productId:product.productId, colorKey:options.colorKey,
          title: product.productTitle + (options.color ? ' - '+options.color : ''),
          variants, profile, demand:{}, allDemand:{}, incoming:{}, stock:{}, catalogError:catalog?.error,
          hasXXL:variants.some((v:any) => v.size === 'XXL') };
        for (const variant of variants) {
          if (!variant.size) continue;
          g.incoming[variant.size] = (g.incoming[variant.size] || 0) + (incomingMap[variant.id] || 0);
          if (Object.hasOwn(stocks,variant.id)) g.stock[variant.size] = (g.stock[variant.size] || 0) + stocks[variant.id];
        }
        map.set(key,g);
      }
      const size = options.size || 'Taglia da verificare';
      g.demand[size] = (g.demand[size] || 0) + (product.purchaseQuantity || 0);
      g.allDemand[size] = (g.allDemand[size] || 0) + product.totalQuantity;
    }
    return Array.from(map.values()).map(g => ({...g, plan:planPacks(g.demand,g.incoming,g.profile?.packType || 'assorted',g.hasXXL,g.stock)}));
  },[products,incomingMap,purchasing,catalogs]);
  const active = groups.find(g => g.key === selected);
  const open = (g:any) => {
    setSelected(g.key);setSupplier(g.profile?.supplier || '');setCode(g.profile?.supplierCode || '');setNotes(g.profile?.notes || '');
    setPackType(g.profile?.packType || 'assorted');setPacks(String(g.plan.packs));setDate('');setConfirming(false);setNotice('');
    setPhysical(Object.fromEntries(g.variants.map((v:any) => {
      const s = purchasing.stocks.find((s:any) => s.variantId === v.id);
      return [v.id,s ? String(s.quantity) : ''];
    })));
    requestId.current = crypto.randomUUID();
  };
  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data?.success) return;
    setNotice(fetcher.data.intent === 'purchase' ? 'Ordine registrato: tutte le taglie sono nella merce in arrivo.' : 'Dati salvati.');
    if (fetcher.data.intent === 'purchase') { setSelected(null);setConfirming(false); }
    revalidator.revalidate();
  },[fetcher.data,fetcher.state]);
  const payload = active ? {productId:active.productId,colorKey:active.colorKey,supplier,supplierCode:code,notes,packType} : {};
  const submit = (intent:string,data:any) => fetcher.submit({intent,data:JSON.stringify(data)},{method:'post',action:endpoint});
  const plan = active ? planPacks(active.demand,active.incoming,packType,active.hasXXL,active.stock) : null;
  useEffect(() => {
    if (active && plan) setPacks(String(plan.packs));
  }, [active?.key, plan?.packs]);
  const composition = active ? packComposition(packType,active.hasXXL) : {};
  const count = Number(packs);
  const quantities = Object.fromEntries(Object.entries(composition).map(([s,q]) => [s,q*(Number.isSafeInteger(count) ? count : 0)]));
  const invalidVariants = active ? Object.keys(composition).filter(s => active.variants.filter((v:any) => v.size===s).length!==1) : [];
  const invalid = !plan || !!active?.catalogError || plan.unsupported.length>0 || invalidVariants.length>0 || !Number.isSafeInteger(count) || count<1 || count>10000 || !supplier.trim() || !code.trim() || total(plan.residual)===0;
  const filtered = groups.filter(g => (showOriginal || total(g.plan.residual)>0) && (!supplierFilter || g.profile?.supplier === supplierFilter) &&
    `${g.title} ${g.profile?.supplier || ''} ${g.profile?.supplierCode || ''}`.toLowerCase().includes(search.toLowerCase()));
  const suppliers = Array.from(new Set<string>(purchasing.profiles.map((p:any) => p.supplier).filter(Boolean))).sort();
  return <BlockStack gap="400">
    <Text as="h3" variant="headingMd">Acquisti per modello e colore</Text>
    <Text as="p">Fabbisogno operativo: pagati e contrassegni accettati senza blocchi. Le quantita gia ordinate e le scorte fisiche confermate vengono sottratte per taglia.</Text>
    {notice && <Banner tone="success" onDismiss={() => setNotice('')}>{notice}</Banner>}
    {fetcher.data?.error && <Banner tone="critical">{fetcher.data.error}</Banner>}
    <InlineStack gap="300" blockAlign="end">
      <TextField label="Cerca prodotto, fornitore o codice" value={search} onChange={setSearch} autoComplete="off" />
      <Select label="Fornitore" value={supplierFilter} onChange={setSupplierFilter} options={[{label:'Tutti',value:''},...suppliers.map(s=>({label:s,value:s}))]} />
      <Checkbox label="Mostra fabbisogno originale e prodotti gia coperti" checked={showOriginal} onChange={setShowOriginal} />
    </InlineStack>
    <Badge>{`${filtered.length} modelli/colori`}</Badge>
    {!filtered.length && <Text as="p">Nessun prodotto da ordinare per questi filtri. Attiva il fabbisogno originale per consultare quelli gia coperti.</Text>}
    {filtered.map(g => <Card key={g.key}><BlockStack gap="200">
      <InlineStack align="space-between" blockAlign="start">
        <BlockStack gap="100"><Text as="h4" fontWeight="bold">{g.title}</Text><Text as="p">{g.profile?.supplier || 'Fornitore da inserire'} · Codice: {g.profile?.supplierCode || 'da inserire'}</Text></BlockStack>
        <Button onClick={()=>open(g)}>Fornitore e ordine</Button>
      </InlineStack>
      <Text as="p">Da preparare: {sizesText(g.demand)}{showOriginal ? ` · Altri pezzi da verificare: ${total(g.allDemand)-total(g.demand)}` : ''}</Text>
      <Text as="p">Gia in arrivo: {sizesText(g.incoming)} · Scorte confermate: {Object.keys(g.stock).length ? sizesText(g.stock) : 'Da contare'}</Text>
      <Text as="p" fontWeight="bold">Da ordinare: {sizesText(g.plan.residual)}</Text>
      {g.catalogError ? <Badge tone="critical">Varianti da aggiornare</Badge> : g.plan.unsupported.length ? <Badge tone="critical">{`Taglie fuori pacco: ${g.plan.unsupported.join(', ')}`}</Badge> :
        <Text as="p">{g.plan.packs} pacchi consigliati · {packOptions(g.hasXXL).find(p=>p.value===(g.profile?.packType || 'assorted'))?.label}</Text>}
    </BlockStack></Card>)}
    <Modal open={!!active} onClose={()=>{if(!busy)setSelected(null);}} title={confirming ? 'Conferma ordine fornitore' : active?.title || 'Ordine'}
      primaryAction={{content:confirming ? 'Conferma registrazione' : 'Registra ordine fornitore',loading:busy,disabled:invalid || busy,onAction:()=>{
        if (!confirming) setConfirming(true);
        else submit('purchase',{...payload,packs:count,expectedArrivalDate:date,requestId:requestId.current});
      }}} secondaryActions={[{content:confirming?'Torna ai dati':'Chiudi',disabled:busy,onAction:()=>confirming?setConfirming(false):setSelected(null)}]}>
      <Modal.Section>{active && plan && <BlockStack gap="400">
        {fetcher.data?.error && <Banner tone="critical">{fetcher.data.error}</Banner>}
        {confirming ? <>
          <Text as="p" fontWeight="bold">{supplier} · Codice {code}</Text>
          <Text as="p">{active.title} · {count} pacchi · {total(quantities)} pezzi</Text>
          <Text as="p">Composizione acquisto: {sizesText(quantities)}</Text>
          <Text as="p">Eccedenza: {sizesText(Object.fromEntries(Object.entries(quantities).map(([s,q])=>[s,Math.max(0,q-(plan.residual[s]||0))])))}</Text>
          {date && <Text as="p">Arrivo previsto: {date}</Text>}
          <Text as="p">Registra l'acquisto nell'app e inserisce tutte le taglie nella merce in arrivo. Non invia messaggi al fornitore.</Text>
        </> : <>
          <TextField label="Fornitore" value={supplier} onChange={setSupplier} autoComplete="off" />
          <TextField label="Codice articolo fornitore (distinto dallo SKU)" value={code} onChange={setCode} autoComplete="off" />
          <TextField label="Note" value={notes} onChange={setNotes} multiline autoComplete="off" />
          <Select label="Composizione pacco" options={packOptions(active.hasXXL)} value={packType} onChange={v=>{
            setPackType(v as PackType);setPacks(String(planPacks(active.demand,active.incoming,v as PackType,active.hasXXL,active.stock).packs));
          }} />
          <Button disabled={busy} loading={busy && fetcher.formData?.get('intent')==='profile'} onClick={()=>submit('profile',payload)}>Salva fornitore, codice e pacco</Button>
          <DataTable columnContentTypes={['text','numeric','numeric','text','numeric']} headings={['Taglia','Necessari','In arrivo','Scorta confermata','Da ordinare']}
            rows={Array.from(new Set([...Object.keys(active.demand),...Object.keys(composition)])).map(s=>[s,active.demand[s]||0,active.incoming[s]||0,
              active.variants.some((v:any)=>v.size===s && purchasing.stocks.some((x:any)=>x.variantId===v.id))?String(active.stock[s]||0):'Da contare',plan.residual[s]||0])} />
          <Text as="p">Le scorte sconosciute non sono zero: il calcolo indica il fabbisogno ancora senza copertura confermata. Inserisci le quantita fisiche prima dell'acquisto, se hai merce disponibile.</Text>
          <Text as="h4" fontWeight="bold">Giacenza fisica manuale</Text>
          {active.variants.map((v:any)=><TextField key={v.id} label={v.title} type="number" min={0} autoComplete="off" placeholder="Da contare" value={physical[v.id] ?? ''} onChange={value=>setPhysical(prev=>({...prev,[v.id]:value}))} />)}
          <Button disabled={busy} onClick={()=>submit('stock',{...payload,stocks:active.variants.filter((v:any)=>physical[v.id]!=='' && physical[v.id]!==undefined).map((v:any)=>({variantId:v.id,quantity:Number(physical[v.id])}))})}>Salva giacenza fisica</Button>
          {(plan.unsupported.length>0 || invalidVariants.length>0) && <Banner tone="warning">Impossibile ordinare automaticamente: verificare taglie {Array.from(new Set([...plan.unsupported,...invalidVariants])).join(', ')}. Nessuna sostituzione automatica.</Banner>}
          <Text as="p" fontWeight="bold">Consigliati: {plan.packs} pacchi. Eccedenza prevista: {sizesText(plan.excess)}</Text>
          <TextField label="Pacchi da ordinare" type="number" min={1} max={10000} value={packs} onChange={setPacks} autoComplete="off" />
          <Text as="p">Acquisto: {sizesText(quantities)} · Totale {total(quantities)} pezzi</Text>
          {count < plan.packs && count > 0 && <Banner tone="warning">Acquisto parziale: alcune taglie rimarranno da ordinare.</Banner>}
          <TextField label="Data prevista arrivo (facoltativa)" type="date" value={date} onChange={setDate} autoComplete="off" />
        </>}
      </BlockStack>}</Modal.Section>
    </Modal>
  </BlockStack>;
}

export function PurchaseHistory({purchases}:{purchases:any[]}) {
  const fetcher=useFetcher<any>();
  const [cancelId,setCancelId]=useState<string|null>(null);
  useEffect(()=>{if(fetcher.state==='idle'&&fetcher.data?.success)setCancelId(null);},[fetcher.state,fetcher.data]);
  return <BlockStack gap="300"><Text as="h3" variant="headingMd">Ordini ai fornitori</Text>
    {fetcher.data?.error && <Banner tone="critical">{fetcher.data.error}</Banner>}
    {!purchases.length && <Text as="p">Nessun ordine a pacchi registrato.</Text>}
    {purchases.map(p=><Card key={p.id}><BlockStack gap="200">
      <Text as="p" fontWeight="bold">{p.supplier} · {p.supplierCode} · {p.productTitle}</Text>
      <Text as="p">{p.packs} pacchi · {(p.items as any[]).map(i=>`${i.quantity} ${i.size}`).join(' · ')} · {new Date(p.createdAt).toLocaleDateString('it-IT')}</Text>
      {p.expectedArrivalDate && <Text as="p">Arrivo: {new Date(p.expectedArrivalDate).toLocaleDateString('it-IT')}</Text>}
      {p.status==='cancelled'?<Badge>Annullato</Badge>:<Button tone="critical" onClick={()=>setCancelId(p.id)}>Annulla registrazione</Button>}
    </BlockStack></Card>)}
    <Modal open={!!cancelId} title="Annulla ordine fornitore" onClose={()=>setCancelId(null)} primaryAction={{content:'Annulla registrazione',destructive:true,loading:fetcher.state!=='idle',onAction:()=>fetcher.submit({intent:'cancel',data:JSON.stringify({id:cancelId})},{method:'post',action:endpoint})}} secondaryActions={[{content:'Indietro',onAction:()=>setCancelId(null)}]}><Modal.Section><Text as="p">Le quantita saranno rimosse dalla merce in arrivo e torneranno nel fabbisogno da ordinare. Lo storico rimane consultabile.</Text></Modal.Section></Modal>
  </BlockStack>;
}
