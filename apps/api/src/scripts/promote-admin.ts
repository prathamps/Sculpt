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
    if (error instanceof Error) {
        console.error(`Error promoting user: ${error.message}`);
    } else {
        console.error('An unknown error occurred.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
