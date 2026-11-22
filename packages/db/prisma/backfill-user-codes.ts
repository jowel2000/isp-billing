import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let updated = 0;

  for (const tenant of tenants) {
    const users = await prisma.user.findMany({
      where: { tenantId: tenant.id, userCode: null },
      select: { id: true },
    });

    for (const user of users) {
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const code = String(10000 + Math.floor(Math.random() * 90000));
        const existing = await prisma.user.findUnique({
          where: { tenantId_userCode: { tenantId: tenant.id, userCode: code } },
          select: { id: true },
        });
        if (!existing) {
          await prisma.user.update({ where: { id: user.id }, data: { userCode: code } });
          updated += 1;
          break;
        }
      }
    }
  }

  console.log(`Backfilled user codes: ${updated}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
