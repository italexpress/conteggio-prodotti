import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
// Only additive setup; never reset, drop or recreate existing application tables.
if (process.env.DATABASE_URL) {
  const db = new PrismaClient();
  try {
    const sql = await readFile(new URL('./prisma/purchasing.sql', import.meta.url), 'utf8');
    await db.$transaction(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => db.$executeRawUnsafe(s)), { timeout: 30000 });
    console.log('Supplier purchasing tables ready.');
  } finally { await db.$disconnect(); }
} else if (process.env.VERCEL) {
  throw new Error('DATABASE_URL is required for supplier purchasing setup.');
} else { console.log('Local build: database setup skipped (no DATABASE_URL).'); }
