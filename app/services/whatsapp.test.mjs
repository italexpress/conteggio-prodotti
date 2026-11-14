import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normalizeContactPhone,whatsappLink,contactAccessDenied} from './whatsapp.ts';
test('international and national numbers use the actual country, never an assumed country',()=>{
 assert.equal(normalizeContactPhone('0039 333 123 4567'),'+393331234567');
 assert.equal(normalizeContactPhone('333 1234567','IT'),'+393331234567');
 assert.equal(normalizeContactPhone('333 1234567'),null);
 assert.equal(normalizeContactPhone('020 7946 0018','GB'),'+442079460018');
 assert.equal(normalizeContactPhone('invalid'),null);
 assert.equal(normalizeContactPhone('+39 333 1234567 ext 20'),null);
});
test('WhatsApp links use the requested greeting with customer name and parcel emoji',()=>{
 const link=whatsappLink('+39 333 1234567','Maria Grazia');
 assert(link.startsWith('https://wa.me/393331234567?text='));
 assert.equal(new URL(link).searchParams.get('text'),'Ciao Maria Grazia! Perdonaci per il disturbo, ti scriviamo in merito al tuo ordine 📦');
 assert.equal(whatsappLink(null,'Maria'),null);
});
test('missing names and the generic customer placeholder use Ciao without an invented name',()=>{
 for(const name of [undefined,null,'','  ','Cliente'])assert(new URL(whatsappLink('+393331234567',name)).searchParams.get('text').startsWith('Ciao! Perdonaci'));
});
test('only contact permission denials permit unavailable-contact fallback',()=>{
 assert(contactAccessDenied({body:{errors:{graphQLErrors:[{extensions:{code:'ACCESS_DENIED'},path:['nodes',0,'shippingAddress']}]}}}));
 assert(!contactAccessDenied({errors:[{extensions:{code:'THROTTLED'},path:['nodes',0,'phone']}]}));
 assert(!contactAccessDenied({errors:[{extensions:{code:'ACCESS_DENIED'},path:['orders']}]}));
});
