import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * Webhook handler per orders/create
 * Quando viene creato un nuovo ordine, logga l'evento.
 * La pagina principale ricaricherà i dati dal vivo tramite il loader.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`📦 [${topic}] Nuovo ordine creato per ${shop}: #${(payload as any)?.name || "N/A"}`);

  // Non serve invalidare cache: la pagina ricarica i dati ad ogni visita.
  // I webhook servono per eventuali estensioni future (notifiche, ecc.)

  return new Response();
};
