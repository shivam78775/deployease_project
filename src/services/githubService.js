// src/services/githubService.js
import { Octokit } from "@octokit/rest";
import simpleGit from "simple-git";
import chalk from "chalk";
import fs from "fs";

export async function createGitHubRepo(repoName, token, description = "") {
  const octokit = new Octokit({ auth: token });

  try {
    console.log(chalk.cyan(`\n🔧 Creating GitHub repository: ${repoName} ...`));
    const response = await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      private: false,
      description,
    });

    console.log(chalk.green(`✅ Repository created: ${response.data.html_url}`));

    return response.data.clone_url;
  } catch (err) {
    console.error(chalk.red("❌ Failed to create GitHub repo:"), err.message);
    return null;
  }
}

export async function initLocalRepo(repoUrl) {
  const git = simpleGit();

  try {
    console.log(chalk.cyan("\n📁 Initializing local git repo..."));

    if (!fs.existsSync(".git")) {
      await git.init();
      await git.add(".");
      await git.commit("Initial commit from DeployEase 🚀");
    }

    await git.addRemote("origin", repoUrl);
    await git.push("origin", "main", ["--set-upstream"]);
    console.log(chalk.green("✅ Pushed to GitHub successfully!"));
  } catch (err) {
    console.error(chalk.red("❌ Git initialization failed:"), err.message);
  }
}
