import prisma from "../db.server";

export async function getOutOfStockProducts(shop: string) {
  return prisma.outOfStockProduct.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
}

export async function addOutOfStockProduct(data: {
  shop: string;
  variantId: string;
  displayName: string;
}) {
  return prisma.outOfStockProduct.upsert({
    where: {
      shop_variantId: {
        shop: data.shop,
        variantId: data.variantId,
      },
    },
    update: {
      displayName: data.displayName,
    },
    create: {
      shop: data.shop,
      variantId: data.variantId,
      displayName: data.displayName,
    },
  });
}

export async function removeOutOfStockProduct(id: string, shop: string) {
  return prisma.outOfStockProduct.deleteMany({
    where: {
      id,
      shop,
    },
  });
}
