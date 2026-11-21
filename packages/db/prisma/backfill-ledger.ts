import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const entries = await prisma.ledgerEntry.findMany({
    where: { clientId: null },
    select: {
      id: true,
      transactionId: true,
      refType: true,
      refId: true,
    },
  });

  let updated = 0;

  for (const entry of entries) {
    let paymentId: string | null = null;

    if (
      (entry.refType === 'payment' || entry.refType === 'refund') &&
      entry.refId
    ) {
      paymentId = entry.refId;
    } else if (entry.transactionId.startsWith('refund:')) {
      paymentId = entry.transactionId.slice('refund:'.length);
    } else {
      const byTransaction = await prisma.payment.findUnique({
        where: { id: entry.transactionId },
        select: { id: true },
      });
      paymentId = byTransaction?.id ?? null;
    }

    if (!paymentId) continue;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { clientId: true },
    });

    if (!payment) continue;

    await prisma.ledgerEntry.update({
      where: { id: entry.id },
      data: { clientId: payment.clientId },
    });
    updated += 1;
  }

  console.log(`Ledger backfill complete: ${updated} entries updated`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
