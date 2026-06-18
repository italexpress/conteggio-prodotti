import prisma from "../db.server";
import type { FixedCost } from "@prisma/client";

export type { FixedCost };

export async function getFixedCosts(shop: string): Promise<FixedCost[]> {
  return prisma.fixedCost.findMany({
    where: { shop },
    orderBy: { category: "asc" },
  });
}

export async function getFixedCostsTotal(shop: string): Promise<number> {
  const costs = await getFixedCosts(shop);
  return costs.reduce((total, cost) => total + cost.monthlyCost, 0);
}

export async function addFixedCost(data: Omit<FixedCost, "id" | "createdAt" | "updatedAt">): Promise<FixedCost> {
  return prisma.fixedCost.create({
    data,
  });
}

export async function updateFixedCost(
  id: string,
  shop: string,
  data: Partial<Omit<FixedCost, "id" | "shop" | "createdAt" | "updatedAt">>
): Promise<FixedCost> {
  return prisma.fixedCost.update({
    where: { id, shop },
    data,
  });
}

export async function deleteFixedCost(id: string, shop: string): Promise<void> {
  await prisma.fixedCost.delete({
    where: { id, shop },
  });
}
