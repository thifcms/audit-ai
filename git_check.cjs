const { exec } = require('child_process');
const fs = require('fs');

function runCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, (err, stdout, stderr) => {
      console.log(`\n=== ${cmd} ===`);
      if (stdout) console.log(stdout.trim());
      if (stderr) console.log(`STDERR: ${stderr.trim()}`);
      resolve();
    });
  });
}

async function main() {
  await runCommand('git status');
  await runCommand('git log -1');
  await runCommand('git remote -v');
  await runCommand('git push origin main');
  
  if (fs.existsSync('.git_corrupted')) {
    console.log('\nA pasta .git_corrupted/ está presente no diretório.');
  }
}

main();
