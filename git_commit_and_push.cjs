const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

function runCommand(cmd) {
  return new Promise((resolve) => {
    console.log(`\n========================================`);
    console.log(`Running: ${cmd}`);
    console.log(`========================================`);
    exec(cmd, (err, stdout, stderr) => {
      console.log(`STDOUT:`, stdout.trim() || '(none)');
      console.log(`STDERR:`, stderr.trim() || '(none)');
      resolve({ err, stdout, stderr });
    });
  });
}

function deleteFolderRecursive(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dirPath);
  }
}

async function main() {
  console.log("=== CLEANUP & COMMIT PROTOCOL WITH IDENTITY ===");

  // Set user identity locally for this repository
  await runCommand('git config --local user.name "thifcms"');
  await runCommand('git config --local user.email "thifcms@gmail.com"');

  // Check status before commit
  await runCommand('git status');

  // Stage changes
  await runCommand('git add -A');

  // Commit changes
  const commitRes = await runCommand('git commit -m "fix: melhora extração de NFS-e (tomador, data)"');
  if (commitRes.err && !commitRes.stdout.includes("nothing to commit")) {
    console.error("COMMIT FAILED!", commitRes.err);
    return;
  }

  // Push changes to main
  const pushRes = await runCommand('git push origin main');
  
  if (!pushRes.err) {
    console.log("Push succeeded! Self-destructing script...");
    const selfPath = path.join(__dirname, 'git_commit_and_push.cjs');
    if (fs.existsSync(selfPath)) {
      fs.unlinkSync(selfPath);
    }
  } else {
    console.error("PUSH FAILED!", pushRes.err);
  }
}

main().catch(console.error);
