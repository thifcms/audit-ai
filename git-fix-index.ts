import { execSync } from "child_process";
try {
  execSync("rm -f .git/index", { stdio: "inherit" });
  execSync("git reset", { stdio: "inherit" });
  const status = execSync("git status", { encoding: "utf8" });
  console.log(status);
} catch (e: any) {
  console.error("Failed:", e.message);
}
