import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * Webhook handler per orders/cancelled
 * Quando un ordine viene annullato
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`❌ [${topic}] Ordine annullato per ${shop}: #${(payload as any)?.name || "N/A"}`);

  return new Response();
};
