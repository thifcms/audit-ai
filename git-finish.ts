import { execSync } from "child_process";
try {
  execSync("git config user.email 'thifcms@gmail.com'", { stdio: "inherit" });
  execSync("git config user.name 'thifcms'", { stdio: "inherit" });
  execSync("git add .", { stdio: "inherit" });
  execSync("git commit -m 'chore: remove prompt instructing specifically for R$ 4.052,73 while keeping explicit schema extraction description'", { stdio: "inherit" });
  execSync("npm run build", { stdio: "inherit" });
  execSync("git add .", { stdio: "inherit" });
  execSync("git commit --amend --no-edit", { stdio: "inherit" });
  execSync("git push origin main", { stdio: "inherit" });
  console.log("Success");
} catch (e: any) {
  console.error("Failed:", e.message);
}
