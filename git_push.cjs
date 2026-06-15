const shell = require('child_process');

async function run(cmd) {
  return new Promise((resolve) => {
    shell.exec(cmd, (error, stdout, stderr) => {
      console.log(`\n=== CMD: ${cmd} ===`);
      console.log('STDOUT', stdout.trim());
      console.log('STDERR', stderr.trim());
      resolve({ error, stdout, stderr });
    });
  });
}

async function main() {
  await run('git config --local user.name "thifcms"');
  await run('git config --local user.email "thifcms@gmail.com"');
  
  await run('git add -A');
  await run('git commit -m "fix: aplica logs de captura e corrige guard errôneo de nota_fiscal (NFS-e vs Etiquetas MedNote)"');
  
  await run('git push origin main');
  
  // Cleanup script
  const fs = require('fs');
  fs.unlinkSync(__filename);
}

main().catch(console.error);
