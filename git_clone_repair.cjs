const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

function runCommand(cmd, cwd = __dirname) {
  return new Promise((resolve) => {
    console.log(`\n========================================`);
    console.log(`Running: ${cmd}`);
    console.log(`Cwd: ${cwd}`);
    console.log(`========================================`);
    exec(cmd, { cwd }, (err, stdout, stderr) => {
      console.log(`STDOUT:`, stdout.trim() || '(none)');
      console.log(`STDERR:`, stderr.trim() || '(none)');
      resolve({ err, stdout, stderr });
    });
  });
}

// Helper to recursively delete directory
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
  console.log("=== EXTREME REPAIR PROTOCOL: FRESH CLONE .GIT RESTORATION ===");

  const gitPath = path.join(__dirname, '.git');
  const gitCorruptPath = path.join(__dirname, '.git_corrupted');
  const tempRepoPath = path.join(__dirname, 'temp_repo');

  // Ensure any previous temp files/folders are clean
  if (fs.existsSync(tempRepoPath)) {
    console.log("Cleaning up old temp_repo folder...");
    deleteFolderRecursive(tempRepoPath);
  }
  if (fs.existsSync(gitCorruptPath)) {
    console.log("Cleaning up old .git_corrupted folder...");
    deleteFolderRecursive(gitCorruptPath);
  }

  // 1. Rename existing corrupted .git folder to .git_corrupted
  if (fs.existsSync(gitPath)) {
    console.log("Renaming existing corrupted .git folder to .git_corrupted...");
    fs.renameSync(gitPath, gitCorruptPath);
  }

  // 2. Clone the repository into temp_repo using the authenticated URL
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN environment variable is required.");
    process.exit(1);
  }
  const remoteUrl = `https://${token}@github.com/thifcms/audit-ai.git`;
  console.log("Cloning remote repository into temp_repo...");
  const cloneResult = await runCommand(`git clone "${remoteUrl}" temp_repo`);

  if (cloneResult.err) {
    console.error("CLONE FAILED! Restoring old .git folder to prevent loss of state.");
    if (fs.existsSync(gitCorruptPath)) {
      if (fs.existsSync(gitPath)) {
        deleteFolderRecursive(gitPath);
      }
      fs.renameSync(gitCorruptPath, gitPath);
    }
    return;
  }

  // 3. Move the healthy `.git` folder from `temp_repo` into root
  const tempGitPath = path.join(tempRepoPath, '.git');
  if (fs.existsSync(tempGitPath)) {
    console.log("Moving healthy .git folder to root...");
    fs.renameSync(tempGitPath, gitPath);
  } else {
    console.error("Healthy .git folder not found in cloned repo!");
    return;
  }

  // 4. Clean up temp_repo folder
  console.log("Cleaning up temp_repo folder...");
  deleteFolderRecursive(tempRepoPath);

  // 5. Test results!
  console.log("Git repair successful! Testing status and logs...");
  await runCommand('git status');
  await runCommand('git log -1');
}

main().catch(console.error);
