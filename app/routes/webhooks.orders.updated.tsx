import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * Webhook handler per orders/updated
 * Quando un ordine viene aggiornato (pagamento, modifica, ecc.)
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`🔄 [${topic}] Ordine aggiornato per ${shop}: #${(payload as any)?.name || "N/A"}`);

  return new Response();
};
