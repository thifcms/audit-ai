import { execSync } from "child_process";
try {
  const status = execSync("git status", { encoding: "utf8" });
  console.log(status);
} catch (e: any) {
  console.error("Failed:", e.message);
}
