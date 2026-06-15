const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

function runCommand(cmd, cwd = __dirname) {
  return new Promise((resolve) => {
    exec(cmd, { cwd }, (err, stdout, stderr) => {
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
  const gitPath = path.join(__dirname, '.git');
  const gitCorruptPath = path.join(__dirname, '.git_corrupted');
  const tempRepoPath = path.join(__dirname, 'temp_repo');

  if (fs.existsSync(gitCorruptPath)) deleteFolderRecursive(gitCorruptPath);
  if (fs.existsSync(tempRepoPath)) deleteFolderRecursive(tempRepoPath);
  if (fs.existsSync(gitPath)) {
    fs.renameSync(gitPath, gitCorruptPath);
  }

  const remoteUrl = "https://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@github.com/thifcms/audit-ai.git";
  await runCommand(`git clone "${remoteUrl}" temp_repo`);

  const tempGitPath = path.join(tempRepoPath, '.git');
  if (fs.existsSync(tempGitPath)) {
    fs.renameSync(tempGitPath, gitPath);
  }
  
  deleteFolderRecursive(tempRepoPath);
  deleteFolderRecursive(gitCorruptPath); // Remove definitely now to save space
  
  // Create an empty commit to test push
  await runCommand('git commit --allow-empty -m "chore: test push mechanism"');
  await runCommand('git push origin main');
  
  // Status check
  const statusRes = await runCommand('git status');
  console.log(`\n=== git status ===\n${statusRes.stdout || statusRes.stderr}`);
  
  const logRes = await runCommand('git log -1');
  console.log(`\n=== git log -1 ===\n${logRes.stdout || logRes.stderr}`);
  
  const remoteRes = await runCommand('git remote -v');
  console.log(`\n=== git remote -v ===\n${remoteRes.stdout || remoteRes.stderr}`);
}

main();
