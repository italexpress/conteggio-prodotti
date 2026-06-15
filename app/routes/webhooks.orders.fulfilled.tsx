import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * Webhook handler per orders/fulfilled
 * Quando un ordine viene completamente evaso
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`✅ [${topic}] Ordine evaso per ${shop}: #${(payload as any)?.name || "N/A"}`);

  return new Response();
};
