import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import { productCatalog, saveProfile, registerPurchase, cancelPurchase, saveManualStock } from '../services/purchasing.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const id = new URL(request.url).searchParams.get('productId') || '';
  try { return json(await productCatalog(admin, id)); }
  catch (e: any) { return json({ error: e.message }, { status: 400 }); }
}
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  try {
    const data = JSON.parse(String(form.get('data') || '{}'));
    switch (form.get('intent')) {
      case 'profile': await saveProfile(session.shop, data); break;
      case 'stock': await saveManualStock(admin, session.shop, data); break;
      case 'purchase':
        await saveProfile(session.shop, data);
        await registerPurchase(admin, session.shop, data); break;
      case 'cancel': await cancelPurchase(session.shop, data.id); break;
      default: return json({ error: 'Operazione non valida' }, { status: 400 });
    }
    return json({ success: true, intent: form.get('intent'), requestId: data.requestId || '' });
  } catch (e: any) {
    console.error('Purchasing operation failed', e.code || e.name);
    return json({ error: e.code ? 'Salvataggio non riuscito. Riprovare: il fabbisogno non e stato ridotto.' : e.message }, { status: 400 });
  }
}
