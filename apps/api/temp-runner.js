const { exec } = require('child_process');

const email = process.argv[2];

if (!email) {
  console.error('Please provide an email address.');
  process.exit(1);
}

const command = `ts-node src/scripts/promote-admin.ts ${email}`;

exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error(`exec error: ${error}`);
    return;
  }
  console.log(`stdout: ${stdout}`);
  console.error(`stderr: ${stderr}`);
});
