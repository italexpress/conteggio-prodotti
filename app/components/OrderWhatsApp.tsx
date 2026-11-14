import { useEffect, useState } from 'react';
import { useFetcher } from '@remix-run/react';
import { BlockStack, Button, InlineStack, Text, TextField } from '@shopify/polaris';
import type { UnconfirmedCodOrder } from '../services/orders.server';
import { whatsappLink } from '../services/whatsapp';

export function OrderWhatsApp({order}:{order:UnconfirmedCodOrder}) {
  const fetcher=useFetcher<{success?:boolean;error?:string}>();
  const [editing,setEditing]=useState(false);
  const [phone,setPhone]=useState(order.customerPhone || '');
  useEffect(()=>setPhone(order.customerPhone || ''),[order.customerPhone]);
  useEffect(()=>{if(fetcher.state==='idle' && fetcher.data?.success)setEditing(false)},[fetcher.state,fetcher.data]);
  const url=whatsappLink(order.customerPhone,order.name);
  return <div onClick={event=>event.stopPropagation()}><BlockStack gap="200">
    <InlineStack gap="200">
      {url && <Button url={url} target="_blank" external tone="success">WhatsApp</Button>}
      {order.shopifyUrl && <Button url={order.shopifyUrl} target="_blank" external>Apri ordine</Button>}
      <Button variant="plain" onClick={()=>setEditing(!editing)}>{url?'Modifica numero':'Inserisci numero WhatsApp'}</Button>
    </InlineStack>
    {!url && <Text as="p" variant="bodySm" tone="subdued">{order.contactUnavailable?'Telefono non accessibile da Shopify':'Numero di telefono non disponibile'}</Text>}
    {editing && <fetcher.Form method="post"><BlockStack gap="200">
      <input type="hidden" name="intent" value="saveOrderPhone"/>
      <input type="hidden" name="orderId" value={order.id}/>
      <TextField label="Numero WhatsApp con prefisso internazionale" name="phone" type="tel" autoComplete="off" value={phone} onChange={setPhone} placeholder="+39 333 1234567"/>
      <InlineStack gap="200"><Button submit loading={fetcher.state!=='idle'}>Salva numero</Button><Button onClick={()=>setEditing(false)}>Annulla</Button></InlineStack>
    </BlockStack></fetcher.Form>}
    {fetcher.data?.error && <Text as="p" tone="critical">{fetcher.data.error}</Text>}
  </BlockStack></div>;
}
