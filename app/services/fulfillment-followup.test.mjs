import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getFulfillmentFollowup,needsFulfillment} from './fulfillment-followup.server.ts';
const item=(quantity=2)=>({title:'Prodotto',variantTitle:'M',unfulfilledQuantity:quantity});
const order=(id,date,status='PAID',fulfillment='UNFULFILLED')=>({id,name:'#'+id,createdAt:date,displayFinancialStatus:status,displayFulfillmentStatus:fulfillment,cancelledAt:null,tags:[],paymentGatewayNames:[],lineItems:{nodes:[item()],pageInfo:{hasNextPage:false,endCursor:null}}});
const admin=(pages)=>({graphql:async()=>({json:async()=>({data:{orders:pages.shift()}})})});
test('all actionable payment states are included; refunds cancellations and fulfilled orders excluded',()=>{
 for(const status of ['PAID','PENDING','AUTHORIZED','PARTIALLY_PAID','PARTIALLY_REFUNDED'])assert(needsFulfillment(order('1','2026-01-01',status)));
 for(const status of ['REFUNDED','VOIDED','EXPIRED'])assert(!needsFulfillment(order('1','2026-01-01',status)));
 assert(!needsFulfillment({...order('1','2026-01-01'),cancelledAt:'2026-01-02'}));
 assert(!needsFulfillment(order('1','2026-01-01','PAID','FULFILLED')));
 for(const status of ['PARTIALLY_FULFILLED','ON_HOLD','SCHEDULED','REQUEST_DECLINED'])assert(needsFulfillment(order('1','2026-01-01','PAID',status)));
});
test('all pages are read and oldest orders come first with only outstanding pieces',async()=>{
 const recent=order('2','2026-11-10');recent.lineItems.nodes.push(item(0));
 const cancelled={...order('3','2026-01-01'),cancelledAt:'2026-01-02'};
 const result=await getFulfillmentFollowup(admin([{nodes:[recent,cancelled,order('4','2026-01-01','REFUNDED')],pageInfo:{hasNextPage:true,endCursor:'next'}},{nodes:[order('1','2026-02-01','PENDING')],pageInfo:{hasNextPage:false}}]));
 assert.deepEqual(result.map(o=>o.id),['1','2']);
 assert.equal(result[1].itemCount,2);
 assert.equal(result[1].items.length,1);
});
test('more than 250 order lines are paginated without dropping products',async()=>{
 const node=order('1','2026-01-01');node.lineItems.pageInfo={hasNextPage:true,endCursor:'line2'};
 const responses=[{data:{orders:{nodes:[node],pageInfo:{hasNextPage:false}}}},{data:{order:{lineItems:{nodes:[item(3)],pageInfo:{hasNextPage:false}}}}}];
 const result=await getFulfillmentFollowup({graphql:async()=>({json:async()=>responses.shift()})});
 assert.equal(result[0].itemCount,5);
});
test('API errors and broken pagination do not return incomplete followup lists',async()=>{
 await assert.rejects(getFulfillmentFollowup({graphql:async()=>({json:async()=>({errors:[{message:'Denied'}]})})}));
 await assert.rejects(getFulfillmentFollowup(admin([{nodes:[],pageInfo:{hasNextPage:true,endCursor:null}}])));
});
