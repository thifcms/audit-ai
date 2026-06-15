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

async function main() {
  console.log("=== RESET TO REMOTE STATE PROTOCOL ===");

  // 1. Fetch the latest remote changes first to make sure origin/main is perfectly up-to-date
  await runCommand('git fetch origin main');

  // 2. Perform hard reset to origin/main
  await runCommand('git reset --hard origin/main');

  // 3. Clean untracked files and directories to ensure absolute parity with the remote repo state
  await runCommand('git clean -fd');

  // 4. Verification steps requested by the user
  await runCommand('git log -1');
  await runCommand('git status');

  // Self-destruct
  console.log("\nWork complete. Self-destructing reset script...");
  const selfPath = path.join(__dirname, 'git_reset.cjs');
  if (fs.existsSync(selfPath)) {
    fs.unlinkSync(selfPath);
  }
}

main().catch(console.error);
