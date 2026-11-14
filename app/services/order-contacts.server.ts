import type { AdminApiContext } from '@shopify/shopify-app-remix/server';
import prisma from '../db.server';
import { normalizeContactPhone, contactAccessDenied } from './whatsapp';
import type { UnconfirmedCodOrder } from './orders.server';

export const ORDER_CONTACTS_QUERY = `query OrderContacts($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Order {
      id phone
      shippingAddress { name phone city province countryCodeV2 }
      billingAddress { phone countryCodeV2 }
    }
  }
}`;

export async function enrichOrderContacts(admin: AdminApiContext, shop: string, rows: UnconfirmedCodOrder[]): Promise<UnconfirmedCodOrder[]> {
  const ids=[...new Set(rows.map(r=>r.id))];
  const contacts=new Map<string, any>();
  let unavailable=false;
  for (let i=0;i<ids.length;i+=50) {
    try {
      const response=await admin.graphql(ORDER_CONTACTS_QUERY,{variables:{ids:ids.slice(i,i+50)}});
      const body=await response.json() as any;
      if (body.errors) {
        if (!contactAccessDenied(body)) throw new Error('Impossibile leggere i contatti degli ordini');
        unavailable=true;
      }
      for (const order of body.data?.nodes || []) if(order?.id) contacts.set(order.id,order);
      if (unavailable) break;
    } catch(error) {
      if (!contactAccessDenied(error)) throw error;
      unavailable=true;
      break;
    }
  }
  const manual=ids.length ? await prisma.orderContact.findMany({where:{shop,orderId:{in:ids}}}) : [];
  return rows.map(row=>{
    const contact=contacts.get(row.id);
    const shipping=contact?.shippingAddress;
    const billing=contact?.billingAddress;
    const phone=manual.find(m=>m.orderId===row.id)?.phone ||
      normalizeContactPhone(shipping?.phone,shipping?.countryCodeV2) ||
      normalizeContactPhone(contact?.phone,shipping?.countryCodeV2 || billing?.countryCodeV2) ||
      normalizeContactPhone(billing?.phone,billing?.countryCodeV2);
    return {...row,customerName:shipping?.name || row.customerName,shippingCity:shipping?.city || row.shippingCity,
      shippingProvince:shipping?.province || row.shippingProvince,customerPhone:phone,contactUnavailable:unavailable,
      shopifyUrl:`https://${shop}/admin/orders/${row.id.split('/').pop()}`};
  });
}
