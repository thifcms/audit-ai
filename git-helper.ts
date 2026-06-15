import { execSync } from "child_process";

try {
  console.log("Checking git status...");
  const status = execSync("git status", { encoding: "utf8" });
  console.log(status);

  console.log("Adding files...");
  execSync("git add .");

  console.log("Committing changes...");
  try {
    const commitMsg = "feat: adiciona extração e normalização do campo valorLiquido para notas fiscais NFS-e";
    const commitResult = execSync(`git commit -m "${commitMsg}"`, { encoding: "utf8" });
    console.log(commitResult);
  } catch (commitErr: any) {
    if (commitErr.stdout && commitErr.stdout.includes("nothing to commit")) {
      console.log("Nothing to commit, repository already up to date.");
    } else {
      throw commitErr;
    }
  }

  console.log("Pushing changes...");
  const pushResult = execSync("git push", { encoding: "utf8" });
  console.log(pushResult);
  console.log("Git push executed successfully!");
} catch (error: any) {
  console.error("Error executing Git helper:", error.message);
  if (error.stdout) console.error("Stdout:", error.stdout);
  if (error.stderr) console.error("Stderr:", error.stderr);
}
