// src/services/githubService.js
import { Octokit } from "@octokit/rest";
import simpleGit from "simple-git";
import chalk from "chalk";
import fs from "fs";

export async function createGitHubRepo(repoName, token, description = "") {
  const octokit = new Octokit({ auth: token });

  try {
    // Get authenticated user
    const user = await octokit.rest.users.getAuthenticated();
    const owner = user.data.login;

    console.log(chalk.cyan(`\n🔧 Creating GitHub repository: ${repoName} ...`));

    try {
      const response = await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        private: false,
        description,
      });

      console.log(chalk.green(`✅ Repository created: ${response.data.html_url}`));
      // Return URL with token embedded for git operations
      const cloneUrl = response.data.clone_url;
      const urlWithToken = cloneUrl.replace('https://', `https://${token}@`);
      return { cloneUrl: urlWithToken, owner, htmlUrl: response.data.html_url };
    } catch (createErr) {
      // Check if repo already exists
      if (
        createErr.status === 422 ||
        createErr.message.includes("name already exists") ||
        (createErr.response && createErr.response.data?.message?.includes("already exists"))
      ) {
        console.log(chalk.yellow("⚠️ Repo already exists — using existing repo..."));
        const existingRepo = await octokit.repos.get({ owner, repo: repoName });
        const cloneUrl = existingRepo.data.clone_url;
        const urlWithToken = cloneUrl.replace('https://', `https://${token}@`);
        return { cloneUrl: urlWithToken, owner, htmlUrl: existingRepo.data.html_url };
      } else {
        throw createErr;
      }
    }
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
      await git.removeRemote("origin");
      await git.addRemote("origin", repoUrl);
      console.log(chalk.gray("🔗 Updated remote origin"));
    }

    await git.push("origin", "main", ["--set-upstream", "--force"]);
    console.log(chalk.green("✅ Pushed to GitHub successfully!"));
  } catch (err) {
    console.error(chalk.red("❌ Git initialization failed:"), err.message);
    throw err;
  }
}
