import { execSync } from "child_process";
try {
  execSync("git pull --rebase origin main", { stdio: "inherit" });
  execSync("git push origin main", { stdio: "inherit" });
  console.log("Success");
} catch (e: any) {
  console.error("Failed:", e.message);
}
