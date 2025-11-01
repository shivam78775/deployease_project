import fs from "fs";
import path from "path";
import chalk from "chalk";
import ora from "ora";
import readline from "readline";
import inquirer from "inquirer";
import simpleGit from "simple-git";
import { createGitHubRepo, initLocalRepo } from "../services/githubService.js";
import { getGitHubToken } from "../utils/auth.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (question) =>
  new Promise((resolve) => rl.question(chalk.cyan(question), resolve));

export default async function init() {
  console.log(chalk.cyanBright("\n🚀 DeployEase Initialization Started...\n"));
  const spinner = ora("Checking repository...").start();

  try {
    const git = simpleGit();
    const isRepo = await git.checkIsRepo();

    let repoUrl, repoName, owner, token;

    if (isRepo) {
      const remotes = await git.getRemotes(true);
      if (remotes.length > 0 && remotes[0].refs.fetch.includes("github.com")) {
        repoUrl = remotes[0].refs.fetch.trim();
        const match = repoUrl.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
        if (match) {
          owner = match[1];
          repoName = match[2];
        }
      }
    }

    spinner.succeed("✅ Git repository checked.");

    // Get GitHub token (from stored auth, env, or prompt)
    spinner.start("🔐 Authenticating...");
    token = await getGitHubToken();
    if (!token) {
      spinner.fail("❌ Authentication required.");
      console.log(chalk.yellow("💡 Run 'deployease login' to authenticate.\n"));
      rl.close();
      return;
    }
    spinner.succeed("✅ Authenticated");

    // Get repository info
    // First, get authenticated user to know the owner
    const { Octokit } = await import("@octokit/rest");
    const tempOctokit = new Octokit({ auth: token });
    const authenticatedUser = await tempOctokit.rest.users.getAuthenticated();
    const authenticatedOwner = authenticatedUser.data.login;
    
    if (!repoName) {
      repoName = await ask("📦 Enter your GitHub repository name: ");
      // Sanitize repo name (remove invalid characters for GitHub)
      repoName = repoName.trim().replace(/[^a-zA-Z0-9._-]/g, '-');
      if (!repoName) {
        spinner.fail("❌ Invalid repository name.");
        rl.close();
        return;
      }
      // Use authenticated user as owner (don't prompt for username)
      owner = authenticatedOwner;
      repoUrl = `https://github.com/${owner}/${repoName}.git`;
    } else {
      // If repo was detected, use authenticated owner for consistency
      owner = authenticatedOwner;
    }

    // Detect deploy directory
    const possibleDirs = ["dist", "build", "public", "."];
    const deployDir =
      possibleDirs.find((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory()) || ".";

    spinner.start("🔧 Creating GitHub repository...");

    // Create repository on GitHub (remove emojis from description for API compatibility)
    const repoInfo = await createGitHubRepo(repoName, token, "Deployed using DeployEase");
    if (!repoInfo) {
      spinner.fail("❌ Failed to create or access GitHub repository.");
      rl.close();
      return;
    }

    // Update repoUrl with the actual clone URL (with token for git operations)
    repoUrl = repoInfo.cloneUrl;
    // Update owner from authenticated user
    owner = repoInfo.owner;
    spinner.succeed("✅ GitHub repository ready!");

    spinner.start("📤 Uploading code to GitHub...");

    // Initialize git and push all code
    try {
      if (!isRepo) {
        await git.init();
      }

      // Add all files
      await git.add(".");

      // Check if there are changes to commit
      const status = await git.status();
      if (status.files.length > 0) {
        await git.commit("Initial commit from DeployEase 🚀");
      }

      // Setup remote
      const remotes = await git.getRemotes(true);
      if (!remotes.find((r) => r.name === "origin")) {
        await git.addRemote("origin", repoUrl);
      } else {
        await git.removeRemote("origin");
        await git.addRemote("origin", repoUrl);
      }

      // Get current branch or create main
      const branches = await git.branchLocal();
      const currentBranch = branches.current || "main";
      
      if (!branches.all.includes("main") && currentBranch !== "main") {
        await git.checkoutLocalBranch("main");
      }

      // Push to GitHub
      await git.push("origin", "main", ["--set-upstream"]).catch(async () => {
        // If main doesn't exist remotely, force push
        await git.push("origin", "main", ["--set-upstream", "--force"]);
      });

      spinner.succeed("✅ Code uploaded to GitHub successfully!");
    } catch (gitErr) {
      spinner.warn("⚠️  Git push had issues, but continuing...");
      console.log(chalk.yellow(gitErr.message));
    }

    spinner.start("📝 Creating DeployEase configuration...");

    // Store clean URL without token
    const cleanRepoUrl = repoUrl.replace(/https:\/\/[^@]+@/, 'https://');

    const deployeaseConfig = {
      repo: repoName,
      owner,
      branch: "gh-pages",
      deployDir,
      description: "Deployed using DeployEase",
      repoUrl: cleanRepoUrl,
    };

    fs.writeFileSync(".deployease.json", JSON.stringify(deployeaseConfig, null, 2));

    spinner.succeed("✅ Configuration file created!");
    console.log(chalk.greenBright(`\n📁 Repo: ${repoName}`));
    console.log(chalk.greenBright(`👤 Owner: ${owner}`));
    console.log(chalk.greenBright(`📦 Folder to deploy: ${deployDir}`));
    console.log(chalk.greenBright(`🔗 Repository: ${repoUrl}`));
    console.log(chalk.yellowBright(`\n✅ Your code is now on GitHub!`));
    console.log(chalk.yellowBright(`📤 Next: Run 'deployease deploy' to publish to GitHub Pages 🚀\n`));

    rl.close();
  } catch (err) {
    spinner.fail("❌ Initialization failed.");
    console.error(chalk.redBright(err.message));
    if (err.stack) {
      console.error(chalk.gray(err.stack));
    }
    rl.close();
  }
}
