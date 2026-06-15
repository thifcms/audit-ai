import { execSync } from "child_process";

try {
  console.log("Resolving git conflict...");
  try {
    execSync("git rm dist/server.cjs dist/server.cjs.map git-push.ts git-helper.ts", { encoding: "utf8" });
  } catch (err) {}
  
  console.log("Staging everything to continue rebase...");
  execSync("git add .", { encoding: "utf8" });

  console.log("Iniciando git rebase --continue...");
  try {
    execSync("git -c core.editor=true rebase --continue", { encoding: "utf8", stdio: "inherit" });
  } catch (rebaseErr: any) {}

  console.log("Compiling...");
  execSync("npm run build", { encoding: "utf8", stdio: "inherit" });

  console.log("Staging newly compiled artifacts...");
  execSync("git add .", { encoding: "utf8" });

  console.log("Committing built changes...");
  try {
    execSync("git commit -m 'build: compile fresh server'", { encoding: "utf8" });
  } catch (err) {}

  console.log("Pushing main to origin...");
  execSync("git push origin main", { encoding: "utf8", stdio: "inherit" });

} catch (error: any) {
  console.error("Error during Git rebase resolution:", error.message);
}
