const { exec } = require('child_process');

function runCommand(cmd) {
  return new Promise((resolve) => {
    console.log(`\n========================================`);
    console.log(`Running: ${cmd}`);
    console.log(`========================================`);
    exec(cmd, (err, stdout, stderr) => {
      console.log(`--- STDOUT ---`);
      console.log(stdout || '(no output)');
      console.log(`--- STDERR ---`);
      console.log(stderr || '(no output)');
      if (err) {
        console.log(`--- EXIT CODE: ${err.code} ---`);
        resolve({ stdout, stderr, code: err.code });
      } else {
        console.log(`--- EXIT CODE: 0 ---`);
        resolve({ stdout, stderr, code: 0 });
      }
    });
  });
}

async function main() {
  await runCommand('git status');
  await runCommand('git log -1');
  await runCommand('git remote -v');
  
  // Try to commit
  const commitRes = await runCommand('git add -A && git commit -m "fix: melhora extração de NFS-e (tomador, data)"');
  
  // Try to push
  await runCommand('git push origin main');
}

main().catch(console.error);
