import inquirer from "inquirer";
import chalk from "chalk";
import { createGitHubRepo, initLocalRepo } from "../services/githubService.js";
import fs from "fs";

export default async function initCmd() {
  console.log(chalk.cyan("\n🚀 Welcome to DeployEase Auto Repo Creator!\n"));

  const answers = await inquirer.prompt([
    {
      name: "token",
      message: "👉 Enter your GitHub Personal Access Token:",
      type: "password",
    },
    {
      name: "repoName",
      message: "📦 Enter repository name:",
      default: () => process.cwd().split("\\").pop(),
    },
    {
      name: "description",
      message: "📝 Enter a short description (optional):",
    },
  ]);

  const { token, repoName, description } = answers;

  const repoUrl = await createGitHubRepo(repoName, token, description);

  if (repoUrl) {
    await initLocalRepo(repoUrl);
    fs.writeFileSync(
      "deployease.config.json",
      JSON.stringify({ repoName, repoUrl }, null, 2)
    );
    console.log(chalk.green("\n🎉 Repo created and linked successfully!"));
  } else {
    console.log(chalk.red("\n❌ Could not create repo. Check your token."));
  }
}
