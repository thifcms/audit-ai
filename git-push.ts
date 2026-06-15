import { execSync } from "child_process";
try {
  execSync("git add .", { stdio: "inherit" });
  execSync("git commit -m 'chore: add explicit literal extraction instruction for valorLiquido to avoid fallback to valorTotal'", { stdio: "inherit" });
  execSync("git pull --rebase origin main", { stdio: "inherit" });
  execSync("git push origin main", { stdio: "inherit" });
  console.log("Success");
} catch (e: any) {
  console.error("Failed:", e.message);
}
