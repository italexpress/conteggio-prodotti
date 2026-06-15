import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres.yvwmftacpazqcfzerfaj:Kitemmurt11%3F@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
    }
  }
});

async function main() {
  try {
    await prisma.$connect();
    console.log("SUCCESS! Connected to Supabase!");
  } catch (e) {
    console.error("FAIL! Could not connect:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
