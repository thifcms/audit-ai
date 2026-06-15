import { execSync } from "child_process";

try {
  console.log("Staging all current workspace changes...");
  execSync("git add .");

  console.log("Checking if there are any lingering uncommitted changes to stage...");
  try {
    execSync("git commit -m 'chore: synchronization commit for helper files'", { encoding: "utf8" });
    console.log("Committed pending helper changes successfully.");
  } catch (commitErr: any) {
    console.log("Nothing additional to commit, continuing...");
  }

  console.log("Pulling latest remote changes via rebase...");
  const pullOutput = execSync("git pull --rebase origin main", { encoding: "utf8" });
  console.log("Pull output:", pullOutput);

  console.log("Pushing tracking branch to origin...");
  const pushOutput = execSync("git push origin main", { encoding: "utf8" });
  console.log("Push output:", pushOutput);
  console.log("Git sync operation completed successfully!");
} catch (error: any) {
  console.error("Error executing robust Git helper:", error.message);
  if (error.stdout) console.error("Stdout:", error.stdout);
  if (error.stderr) console.error("Stderr:", error.stderr);
}
