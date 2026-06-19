import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const sessions = await prisma.session.findMany();
  const session = sessions[0];
  const url = `https://${session.shop}/admin/api/2024-01/graphql.json`;
  
  const query = `
  query {
    orders(first: 250) {
      edges {
        node {
          name
          displayFinancialStatus
          tags
          paymentGatewayNames
        }
      }
    }
  }
  `;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': session.accessToken
    },
    body: JSON.stringify({ query })
  });
  
  const data = await res.json();
  const orders = data.data.orders.edges.map(e => e.node);
  
  let validCount = 0;
  for (const order of orders) {
    const status = order.displayFinancialStatus;
    const tags = order.tags || [];
    const gateways = order.paymentGatewayNames || [];
    
    let isCOD = false;
    for (const g of gateways) {
      const lower = g.toLowerCase();
      if (lower.includes("cod") || lower.includes("contrassegno")) isCOD = true;
    }
    if (status === "PENDING" && gateways.length === 0) isCOD = true;
    
    const hasAcceptedTag = tags.some(t => t.toUpperCase().trim() === "ACCETTATO");
    const isStandardValid = status === "PAID" || status === "PARTIALLY_PAID" || (isCOD && hasAcceptedTag);
    
    if (isStandardValid) validCount++;
  }
  
  console.log(`Out of 250 orders, ${validCount} are valid.`);
}
run();
