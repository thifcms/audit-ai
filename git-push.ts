import { execSync } from "child_process";

try {
  console.log("Staging changes...");
  execSync("git add .", { stdio: "inherit" });

  console.log("Committing modifications...");
  try {
    execSync("git commit -m 'fix(extraction): better logging'", { stdio: "inherit" });
  } catch (err) {
    console.log("Nothing to commit.");
  }

  console.log("Pulling...");
  execSync("git pull --rebase origin main", { stdio: "inherit" });

  console.log("Pushing to origin...");
  execSync("git push origin main", { stdio: "inherit" });
  console.log("Push completed!");
} catch (error: any) {
  console.error("Git helper execution failed:", error.message);
  if (error.stdout) console.error("Stdout:", error.stdout);
  if (error.stderr) console.error("Stderr:", error.stderr);
}
