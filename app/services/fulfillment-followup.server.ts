import type { AdminApiContext } from '@shopify/shopify-app-remix/server';
import type { UnconfirmedCodOrder } from './orders.server';

export const FOLLOWUP_ORDERS_QUERY = `query FulfillmentFollowup($cursor: String) {
  orders(first: 50, after: $cursor, sortKey: CREATED_AT, reverse: false,
    query: "fulfillment_status:unfulfilled OR fulfillment_status:partial OR fulfillment_status:on_hold OR fulfillment_status:scheduled OR fulfillment_status:request_declined") {
    nodes {
      id name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus tags paymentGatewayNames
      totalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 250) {
        nodes { title variantTitle unfulfilledQuantity }
        pageInfo { hasNextPage endCursor }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;
export const FOLLOWUP_ITEMS_QUERY = `query FulfillmentFollowupItems($id: ID!, $cursor: String) {
  order(id: $id) {
    lineItems(first: 250, after: $cursor) {
      nodes { title variantTitle unfulfilledQuantity }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const excludedFinancial = new Set(['REFUNDED','VOIDED','EXPIRED']);
const pendingFulfillment = new Set(['UNFULFILLED','PARTIALLY_FULFILLED','ON_HOLD','SCHEDULED','REQUEST_DECLINED','IN_PROGRESS','OPEN','PENDING_FULFILLMENT']);
export function needsFulfillment(order: { cancelledAt?: string | null; displayFinancialStatus: string; displayFulfillmentStatus: string }) {
  return !order.cancelledAt && !excludedFinancial.has(order.displayFinancialStatus) && pendingFulfillment.has(order.displayFulfillmentStatus);
}

export async function getFulfillmentFollowup(admin: AdminApiContext): Promise<UnconfirmedCodOrder[]> {
  const rows: UnconfirmedCodOrder[] = [];
  let cursor: string | null = null;
  do {
    const response = await admin.graphql(FOLLOWUP_ORDERS_QUERY, {variables:{cursor}});
    const body = await response.json() as any;
    if (body.errors || !body.data?.orders) throw new Error('Impossibile caricare tutti gli ordini da evadere');
    for (const order of body.data.orders.nodes) {
      if (!needsFulfillment(order)) continue;
      const lines = [...order.lineItems.nodes];
      let page = order.lineItems.pageInfo;
      const seen = new Set<string>();
      while (page.hasNextPage) {
        if (!page.endCursor || seen.has(page.endCursor)) throw new Error('Paginazione righe ordine incompleta');
        seen.add(page.endCursor);
        const nextResponse = await admin.graphql(FOLLOWUP_ITEMS_QUERY, {variables:{id:order.id,cursor:page.endCursor}});
        const nextBody = await nextResponse.json() as any;
        const next = nextBody.data?.order?.lineItems;
        if (nextBody.errors || !next) throw new Error('Impossibile leggere tutte le righe ordine');
        lines.push(...next.nodes);
        page = next.pageInfo;
      }
      const items = lines.filter(i=>i.unfulfilledQuantity>0).map(i=>({title:i.variantTitle?`${i.title} - ${i.variantTitle}`:i.title,quantity:i.unfulfilledQuantity}));
      if (!items.length) continue;
      const isCod = (order.paymentGatewayNames || []).some((g:string)=>/cod|contrassegno|cash on delivery|pagamento alla consegna/i.test(g));
      rows.push({id:order.id,name:order.name,createdAt:order.createdAt,
        financialStatus:order.displayFinancialStatus,fulfillmentStatus:order.displayFulfillmentStatus,
        isCod,codAccepted:isCod && (order.tags || []).some((t:string)=>t.trim().toUpperCase()==='ACCETTATO'),
        totalPrice:order.totalPriceSet?.shopMoney?.amount || '0',currencyCode:order.totalPriceSet?.shopMoney?.currencyCode || 'EUR',
        customerName:'Cliente',customerEmail:'',shippingCity:'',shippingProvince:'',
        itemCount:items.reduce((sum,i)=>sum+i.quantity,0),items});
    }
    const next = body.data.orders.pageInfo;
    if (next.hasNextPage && (!next.endCursor || next.endCursor===cursor)) throw new Error('Paginazione ordini incompleta');
    cursor=next.hasNextPage?next.endCursor:null;
  } while (cursor);
  return rows.sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime() || a.id.localeCompare(b.id));
}
