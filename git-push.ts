import { execSync } from "child_process";
try {
  execSync("git add .", { stdio: "inherit" });
  execSync("git commit -m 'chore: specify valorLiquido schema description to explicitly extract the exact literal string'", { stdio: "inherit" });
  execSync("git pull --rebase origin main", { stdio: "inherit" });
  execSync("git push origin main", { stdio: "inherit" });
  console.log("Success");
} catch (e: any) {
  console.error("Failed:", e.message);
}
