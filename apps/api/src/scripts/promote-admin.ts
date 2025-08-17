import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error('Please provide an email address.');
    process.exit(1);
  }

  try {
    const user = await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN' },
    });

    console.log(`Successfully promoted ${user.email} to ADMIN.`);
  } catch (error) {
    console.error(`Error promoting user: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
