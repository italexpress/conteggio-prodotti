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
test('WhatsApp links use normalized digits and encode the exact order reference',()=>{
 const link=whatsappLink('+39 333 1234567','#1234');
 assert(link.startsWith('https://wa.me/393331234567?text='));
 assert(new URL(link).searchParams.get('text').includes('#1234'));
 assert.equal(whatsappLink(null,'#1234'),null);
});
test('only contact permission denials permit unavailable-contact fallback',()=>{
 assert(contactAccessDenied({body:{errors:{graphQLErrors:[{extensions:{code:'ACCESS_DENIED'},path:['nodes',0,'shippingAddress']}]}}}));
 assert(!contactAccessDenied({errors:[{extensions:{code:'THROTTLED'},path:['nodes',0,'phone']}]}));
 assert(!contactAccessDenied({errors:[{extensions:{code:'ACCESS_DENIED'},path:['orders']}]}));
});
