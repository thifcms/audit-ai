import { execSync } from "child_process";

try {
  console.log("Resolving git conflict by removing dist/ files from git index...");
  try {
    execSync("git rm dist/server.cjs dist/server.cjs.map", { encoding: "utf8" });
  } catch (err) {
    console.log("dist/ files already removed or not in index, trying manual git add...");
  }
  
  console.log("Staging everything to continue rebase...");
  execSync("git add .", { encoding: "utf8" });

  console.log("Iniciando git rebase --continue...");
  try {
    execSync("git -c core.editor=true rebase --continue", { encoding: "utf8", stdio: "inherit" });
    console.log("Rebase finished successfully!");
  } catch (rebaseErr: any) {
    console.log("Trying next step: is it still resolving? Let's check status.");
    const status = execSync("git status", { encoding: "utf8" });
    console.log(status);
  }

  // Re-run compile/build to generate pristine build artifacts
  console.log("Compiling application to ensure latest build artifacts exist...");
  execSync("npm run build", { encoding: "utf8", stdio: "inherit" });

  console.log("Staging newly compiled artifacts...");
  execSync("git add .", { encoding: "utf8" });

  console.log("Committing built changes...");
  try {
    execSync("git commit -m 'build: compile fresh server and frontend artifacts'", { encoding: "utf8" });
  } catch (err) {
    console.log("Nothing new to commit for bundle.");
  }

  console.log("Pushing main to origin...");
  execSync("git push origin main", { encoding: "utf8", stdio: "inherit" });
  console.log("All changes successfully pushed and synchronized!");

} catch (error: any) {
  console.error("Error during Git rebase resolution:", error.message);
  if (error.stdout) console.error("Stdout:", error.stdout);
  if (error.stderr) console.error("Stderr:", error.stderr);
}
