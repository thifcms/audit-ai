import { execSync } from "child_process";
try {
  execSync("git rebase --abort", { stdio: "inherit" });
  execSync("git reset --soft origin/main", { stdio: "inherit" });
  execSync("git add .", { stdio: "inherit" });
  execSync("git commit -m 'chore: refactor and strengthen NFS-e prompt'", { stdio: "inherit" });
  execSync("npm run build", { stdio: "inherit" });
  execSync("git add .", { stdio: "inherit" });
  execSync("git commit --amend --no-edit", { stdio: "inherit" });
  execSync("git push origin main", { stdio: "inherit" });
  console.log("Success");
} catch (e: any) {
  console.error("Failed:", e.message);
}
