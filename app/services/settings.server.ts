import prisma from "../db.server";
import type { DashboardSettings } from "@prisma/client";

export type { DashboardSettings };

/**
 * Recupera le impostazioni della dashboard per il negozio.
 * Se non esistono ancora, le crea con i valori di default.
 */
export async function getSettings(shop: string): Promise<DashboardSettings> {
  let settings = await prisma.dashboardSettings.findUnique({
    where: { shop },
  });

  if (!settings) {
    settings = await prisma.dashboardSettings.create({
      data: { shop },
    });
  }

  return settings;
}

/**
 * Aggiorna le impostazioni della dashboard.
 */
export async function updateSettings(
  shop: string,
  data: Partial<Omit<DashboardSettings, "id" | "shop" | "createdAt" | "updatedAt">>
): Promise<DashboardSettings> {
  return prisma.dashboardSettings.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });
}
