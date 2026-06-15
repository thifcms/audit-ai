import { execSync } from "child_process";

try {
  console.log("Staging all changes...");
  execSync("git add .", { stdio: "inherit" });

  console.log("Committing modifications...");
  try {
    execSync("git commit -m 'chore: add robust key aliases normalization and temporary DOCUMENT TYPE logging'", { stdio: "inherit" });
  } catch (err) {
    console.log("Nothing to commit.");
  }

  console.log("Pulling remote changes with rebase...");
  execSync("git pull --rebase origin main", { stdio: "inherit" });

  console.log("Pushing synchronization commit to origin...");
  execSync("git push origin main", { stdio: "inherit" });
  console.log("Sync succeeded!");
} catch (error: any) {
  console.error("Git helper execution failed:", error.message);
  if (error.stdout) console.error("Stdout:", error.stdout);
  if (error.stderr) console.error("Stderr:", error.stderr);
}
