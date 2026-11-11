import db from '../db.server';
import { variantGroup, groupKey, packComposition, type PackType } from './pack-planning';

function catalogVariant(v: any) {
  const sizeOption = v.selectedOptions.find((o:any) => /^(taglia|size|taille)$/i.test(o.name.trim()));
  const options = sizeOption ? variantGroup([sizeOption.value,...v.selectedOptions.filter((o:any)=>o!==sizeOption).map((o:any)=>o.value)].join(' / ')) : variantGroup(v.title);
  return { ...v, ...options };
}

export async function productCatalog(admin: any, productId: string) {
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productId)) throw new Error('Prodotto non valido');
  let after: string | null = null;
  const variants: any[] = [];
  let title = '';
  do {
    const response: any = await admin.graphql(`query PurchaseVariants($id: ID!, $after: String) {
      product(id: $id) { title variants(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { id title sku selectedOptions { name value } }
      } }
    }`, { variables: { id: productId, after } });
    const result: any = await response.json();
    if (result.errors || !result.data?.product) throw new Error('Impossibile leggere tutte le varianti Shopify');
    title = result.data.product.title;
    variants.push(...result.data.product.variants.nodes.map(catalogVariant));
    after = result.data.product.variants.pageInfo.hasNextPage ? result.data.product.variants.pageInfo.endCursor : null;
  } while (after);
  return { title, variants };
}

export async function purchasingData(shop: string) {
  const [profiles, stocks, purchases] = await Promise.all([
    db.supplierProduct.findMany({ where: { shop } }),
    db.manualProductStock.findMany({ where: { shop } }),
    db.supplierPurchase.findMany({ where: { shop }, orderBy: { createdAt: 'desc' }, take: 200 }),
  ]);
  return { profiles, stocks, purchases };
}

export async function purchasingCatalogs(admin: any, productIds: string[]) {
  const result: Record<string, any> = {};
  for (let start = 0; start < productIds.length; start += 10) {
    const ids = productIds.slice(start,start+10);
    try {
      const response = await admin.graphql(`query PurchasingCatalogs($ids: [ID!]!) {
        nodes(ids: $ids) { ... on Product { id title variants(first: 50) {
          pageInfo { hasNextPage endCursor }
          nodes { id title sku selectedOptions { name value } }
        } } }
      }`, { variables: { ids } });
      const data = await response.json();
      if (data.errors || !data.data?.nodes) throw new Error('Catalogo incompleto');
      for (const p of data.data.nodes) {
        if (!p?.id) continue;
        result[p.id] = p.variants.pageInfo.hasNextPage ? await productCatalog(admin,p.id) : { title:p.title,variants:p.variants.nodes.map(catalogVariant) };
      }
    } catch {
      for (const id of ids) result[id] = {error:'Varianti non disponibili. Aggiornare prima di ordinare.',variants:[]};
    }
    for (const id of ids) if (!result[id]) result[id] = {error:'Prodotto non disponibile su Shopify.',variants:[]};
  }
  return result;
}

export async function saveProfile(shop: string, data: any) {
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(data.productId) || !['assorted','uniform'].includes(data.packType)) throw new Error('Dati prodotto non validi');
  const values = {
    productId: data.productId, colorKey: String(data.colorKey),
    supplier: String(data.supplier || '').trim().slice(0,200),
    supplierCode: String(data.supplierCode || '').trim().slice(0,200),
    notes: String(data.notes || '').trim().slice(0,2000), packType: data.packType,
  };
  return db.supplierProduct.upsert({
    where: { shop_groupKey: { shop, groupKey: groupKey(data.productId, values.colorKey) } },
    create: { shop, groupKey: groupKey(data.productId, values.colorKey), ...values }, update: values,
  });
}

export async function registerPurchase(admin: any, shop: string, data: any) {
  if (!/^[0-9a-f-]{36}$/i.test(data.requestId)) throw new Error('Richiesta non valida');
  const existing = await db.supplierPurchase.findUnique({ where: { id: data.requestId } });
  if (existing) {
    if (existing.shop !== shop) throw new Error('Richiesta non valida');
    if (existing.status === 'cancelled') throw new Error('Registrazione gia annullata: aprire un nuovo ordine');
    if (existing.groupKey !== groupKey(data.productId,data.colorKey) || existing.packs !== Number(data.packs) || existing.packType !== data.packType) throw new Error('Questa richiesta e gia stata registrata con dati diversi. Aggiornare prima di procedere.');
    return existing;
  }
  const packs = Number(data.packs);
  if (!Number.isSafeInteger(packs) || packs < 1 || packs > 10000) throw new Error('Inserire un numero intero di pacchi fra 1 e 10000');
  const catalog = await productCatalog(admin, data.productId);
  const variants = catalog.variants.filter(v => v.colorKey === data.colorKey);
  if (!variants.length) throw new Error('Colore non trovato');
  const composition = packComposition(data.packType as PackType, variants.some(v => v.size === 'XXL'));
  const items = Object.entries(composition).map(([size, perPack]) => {
    const matches = variants.filter(v => v.size === size);
    if (matches.length !== 1) throw new Error(`Taglia ${size}: variante mancante o ambigua. Nessun ordine registrato.`);
    const v = matches[0];
    return { productId: data.productId, variantId: v.id, productTitle: catalog.title,
      variantTitle: v.title, displayName: `${catalog.title} - ${v.title}`, quantity: packs * perPack, size };
  });
  if (!String(data.supplier || '').trim() || !String(data.supplierCode || '').trim()) throw new Error('Inserire fornitore e codice articolo');
  const expected = data.expectedArrivalDate ? new Date(`${data.expectedArrivalDate}T12:00:00Z`) : null;
  if (expected && !Number.isFinite(expected.getTime())) throw new Error('Data non valida');
  try {
    return await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${shop + ':' + groupKey(data.productId, data.colorKey)}))`;
      const duplicate = await tx.supplierPurchase.findUnique({ where: { id: data.requestId } });
      if (duplicate) {
        if (duplicate.shop !== shop) throw new Error('Richiesta non valida');
        return duplicate;
      }
      const purchase = await tx.supplierPurchase.create({ data: {
        id: data.requestId, shop, groupKey: groupKey(data.productId, data.colorKey),
        productTitle: catalog.title + (variants[0].color ? ' - ' + variants[0].color : ''),
        supplier: String(data.supplier).trim().slice(0,200), supplierCode: String(data.supplierCode).trim().slice(0,200),
        notes: String(data.notes || '').slice(0,2000), packType: data.packType, packs, items,
        expectedArrivalDate: expected,
      } });
      await tx.incomingProduct.createMany({ data: items.map(item => ({
        id: `purchase/${purchase.id}/${item.variantId.split('/').pop()}`,
        shop, productId: item.productId, variantId: item.variantId, productTitle: item.productTitle,
        variantTitle: item.variantTitle, displayName: item.displayName, quantity: item.quantity,
        expectedArrivalDate: expected,
      })) });
      return purchase;
    }, { timeout: 15000 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      const duplicate = await db.supplierPurchase.findUnique({ where: { id: data.requestId } });
      if (duplicate?.shop === shop) return duplicate;
    }
    throw error;
  }
}

export async function cancelPurchase(shop: string, id: string) {
  return db.$transaction(async tx => {
    const item = await tx.supplierPurchase.findFirst({ where: { id, shop } });
    if (!item) throw new Error('Ordine fornitore non trovato');
    await tx.incomingProduct.deleteMany({ where: { shop, id: { startsWith: `purchase/${id}/` } } });
    await tx.supplierPurchase.update({ where: { id }, data: { status: 'cancelled' } });
  });
}

export async function saveManualStock(admin: any, shop: string, data: any) {
  const catalog = await productCatalog(admin, data.productId);
  if (!Array.isArray(data.stocks) || data.stocks.length > 500) throw new Error('Scorte non valide');
  const ids = new Set(catalog.variants.filter(v => v.colorKey === data.colorKey).map(v => v.id));
  for (const s of data.stocks) if (!ids.has(s.variantId) || !Number.isSafeInteger(s.quantity) || s.quantity < 0) throw new Error('Quantita fisica non valida');
  await db.$transaction(data.stocks.map((s: any) => db.manualProductStock.upsert({
    where: { shop_variantId: { shop, variantId: s.variantId } },
    create: { shop, variantId: s.variantId, quantity: s.quantity }, update: { quantity: s.quantity },
  })));
}
