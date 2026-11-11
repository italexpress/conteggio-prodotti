import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({entryPoints:['app/services/purchasing.server.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{
  name:'fake-database',setup(b){b.onResolve({filter:/db\.server$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default globalThis.__purchaseDb;'}));}
}]});
const state = {purchases:new Map(),incoming:[],fail:false};
const db = {
  supplierPurchase:{
    findUnique:async({where})=>state.purchases.get(where.id),
    findFirst:async({where})=>{const p=state.purchases.get(where.id);return p?.shop===where.shop?p:null;},
    create:async({data})=>{state.purchases.set(data.id,data);return data;},
    update:async({where,data})=>{Object.assign(state.purchases.get(where.id),data);},
  },
  incomingProduct:{
    createMany:async({data})=>{if(state.fail)throw new Error('Database write failed');state.incoming.push(...data);},
    deleteMany:async({where})=>{state.incoming=state.incoming.filter(i=>i.shop!==where.shop||!i.id.startsWith(where.id.startsWith));},
  },
  $executeRaw:async()=>{},
  $transaction:async fn=>{const prev=structuredClone({purchases:state.purchases,incoming:state.incoming});try{return await fn(db);}catch(e){Object.assign(state,prev);throw e;}},
};
globalThis.__purchaseDb=db;
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const variants=['S','M','L','XL','XXL'].map(s=>({id:`gid://shopify/ProductVariant/${s}`,title:`Nero / ${s}`,sku:'',selectedOptions:[{name:'Colore',value:'Nero'},{name:'Taglia',value:s}]}));
const admin={graphql:async()=>({json:async()=>({data:{product:{title:'Modello',variants:{nodes:variants,pageInfo:{hasNextPage:false}}}}})})};
const input={requestId:'11111111-1111-4111-8111-111111111111',productId:'gid://shopify/Product/123',colorKey:'NERO',supplier:'Fornitore',supplierCode:'ART-42',packType:'assorted',packs:2};
function reset(){state.purchases.clear();state.incoming=[];state.fail=false;}
test('purchase writes all catalog sizes, preserves supplier code and retries once',async()=>{
 reset();await api.registerPurchase(admin,'shop',input);await api.registerPurchase(admin,'shop',input);
 assert.equal(state.purchases.size,1);assert.equal(state.incoming.length,5);
 assert.equal(state.incoming.reduce((s,i)=>s+i.quantity,0),14);
 assert.equal(state.purchases.get(input.requestId).supplierCode,'ART-42');
});
test('a failure rolls back both purchase and incoming, and can safely retry',async()=>{
 reset();state.fail=true;await assert.rejects(api.registerPurchase(admin,'shop',input));
 assert.equal(state.purchases.size,0);assert.equal(state.incoming.length,0);
 state.fail=false;await api.registerPurchase(admin,'shop',input);assert.equal(state.incoming.length,5);
});
test('cancel removes only linked incoming and keeps cancelled history',async()=>{
 reset();await api.registerPurchase(admin,'shop',input);
 state.incoming.push({id:'manual/1',shop:'shop',quantity:3});
 await api.cancelPurchase('shop',input.requestId);
 assert.equal(state.incoming.length,1);assert.equal(state.incoming[0].id,'manual/1');
 assert.equal(state.purchases.get(input.requestId).status,'cancelled');
});
test('missing pack size and another shop cannot register or cancel',async()=>{
 reset();const missingAdmin={graphql:async()=>({json:async()=>({data:{product:{title:'Modello',variants:{nodes:variants.filter(v=>v.title!=='Nero / XL'),pageInfo:{hasNextPage:false}}}}})})};
 await assert.rejects(api.registerPurchase(missingAdmin,'shop',input),/XL/);assert.equal(state.purchases.size,0);
 await api.registerPurchase(admin,'shop',input);
 await assert.rejects(api.registerPurchase(admin,'other',input));
 await assert.rejects(api.cancelPurchase('other',input.requestId));assert.equal(state.incoming.length,5);
});
