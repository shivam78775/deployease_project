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
    if (
      err.message.includes("name already exists") ||
      (err.response && err.response.data?.message?.includes("already exists"))
    ) {
      console.log(chalk.yellow("⚠️ Repo already exists — using existing repo..."));
      const existingRepo = await octokit.repos.get({ owner: (await octokit.rest.users.getAuthenticated()).data.login, repo: repoName });
      return existingRepo.data.clone_url;
    } else {
      console.error(chalk.red("❌ Failed to create GitHub repo:"), err.message);
      return null;
    }
  }
}

export async function initLocalRepo(repoUrl) {
  const git = simpleGit();

  try {
    console.log(chalk.cyan("\n📁 Initializing local git repo..."));

    if (!fs.existsSync(".git")) {
      await git.init();
      console.log(chalk.gray("🧱 Initialized new git repo"));
    }

    await git.add(".");
    await git.commit("Initial commit from DeployEase 🚀").catch(() => {});

    const branches = await git.branchLocal();
    if (!branches.all.includes("main")) {
      await git.checkoutLocalBranch("main");
      console.log(chalk.gray("🌿 Switched to branch 'main'"));
    }

    const remotes = await git.getRemotes(true);
    if (!remotes.find((r) => r.name === "origin")) {
      await git.addRemote("origin", repoUrl);
      console.log(chalk.gray("🔗 Linked remote origin"));
    } else {
      console.log(chalk.gray("🔗 Remote origin already exists, skipping..."));
    }

    await git.push("origin", "main", ["--set-upstream", "--force"]);
    console.log(chalk.green("✅ Pushed to GitHub successfully!"));
  } catch (err) {
    console.error(chalk.red("❌ Git initialization failed:"), err.message);
  }
}
