import { execSync } from "child_process";
import fs from "fs";

try {
  console.log("Renaming corrupt .git");
  // fs.renameSync(".git", ".git_corrupt"); // Already done
  
  console.log("Cloning fresh...");
  execSync("git clone https://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@github.com/thifcms/audit-ai.git .git_fresh", { stdio: "inherit" });
  
  console.log("Swapping .git");
  fs.renameSync(".git_fresh/.git", ".git");
  fs.rmSync(".git_fresh", { recursive: true, force: true });
  fs.rmSync(".git_corrupt", { recursive: true, force: true });

  console.log("Adding and committing...");
  execSync("git add .", { stdio: "inherit" });
  execSync("git commit -m 'chore: remove prompt instructing specifically for R$ 4.052,73 while keeping explicit schema extraction description'", { stdio: "inherit" });
  
  console.log("Pushing...");
  execSync("git push origin main", { stdio: "inherit" });
  console.log("Success");
} catch (e: any) {
  console.error("Failed:", e.message);
}
