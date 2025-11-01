import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import os from "os";
import ora from "ora";
import chalk from "chalk";
import simpleGit from "simple-git";
import readline from "readline";
import inquirer from "inquirer";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export default async function deploy() {
  console.log(chalk.cyanBright("\n🚀 Starting deployment...\n"));
  const spinner = ora("Preparing deployment...").start();

  try {
    const configPath = path.resolve(".deployease.json");
    if (!fs.existsSync(configPath)) {
      spinner.fail("❌ No .deployease.json found!");
      console.log(chalk.yellow("💡 Run 'deployease init' first.\n"));
      rl.close();
      return;
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const { repo, owner, branch = "gh-pages", deployDir = ".", description, repoUrl } = config;

    if (!repo || !owner) {
      spinner.fail("❌ Missing repo or owner in .deployease.json");
      rl.close();
      return;
    }

    // Ensure deployDir is defined and resolve to absolute path
    if (!deployDir || typeof deployDir !== 'string') {
      spinner.fail("❌ Invalid deployDir in .deployease.json");
      rl.close();
      return;
    }

    const fullPath = path.resolve(process.cwd(), deployDir);
    
    // Normalize the path to handle Windows/Unix differences
    const normalizedPath = path.normalize(fullPath);
    
    if (!fs.existsSync(normalizedPath)) {
      spinner.fail(`❌ Directory '${deployDir}' (${normalizedPath}) not found.`);
      rl.close();
      return;
    }

    // Verify it's a directory
    const stats = fs.statSync(normalizedPath);
    if (!stats.isDirectory()) {
      spinner.fail(`❌ '${deployDir}' is not a directory.`);
      rl.close();
      return;
    }

    // Get GitHub token for authentication
    let token = process.env.GITHUB_TOKEN;
    if (!token) {
      spinner.stop();
      console.log(chalk.yellow("\n⚠️  GitHub token not found in environment."));
      console.log(chalk.gray("   Create a token at: https://github.com/settings/tokens"));
      console.log(chalk.gray("   Required permissions: repo, workflow\n"));
      const tokenPrompt = await inquirer.prompt([
        {
          type: "password",
          name: "token",
          message: "🔑 Enter your GitHub Personal Access Token:",
          mask: "*",
        },
      ]);
      token = tokenPrompt.token;
      if (!token) {
        spinner.fail("❌ GitHub token is required for deployment.");
        rl.close();
        return;
      }
      spinner.start("Continuing deployment...");
    }

    spinner.text = `🚚 Deploying from: ${chalk.blue(normalizedPath)} to ${chalk.blue(branch)} branch...`;

    // Prepare repo URL with token for authentication
    const repoUrlWithToken = `https://${token}@github.com/${owner}/${repo}.git`;

    // Debug: Log the path being used
    console.log(chalk.gray(`📂 Deploy directory: ${normalizedPath}`));
    console.log(chalk.gray(`📦 Repository: ${owner}/${repo}`));
    console.log(chalk.gray(`🌿 Branch: ${branch}\n`));

    // Use git from the project root, not the deploy directory
    // We'll create a temporary git repo in a temp directory to avoid conflicts
    const tempDir = path.join(os.tmpdir(), `deployease-${Date.now()}`);
    
    spinner.text = `📦 Preparing deployment files...`;
    
    // Create temp directory and copy files
    await fsExtra.ensureDir(tempDir);
    await fsExtra.copy(normalizedPath, tempDir, {
      filter: (src) => {
        // Don't copy .git directories or node_modules
        const relativePath = path.relative(normalizedPath, src);
        return !relativePath.includes('.git') && !relativePath.includes('node_modules');
      }
    });
    
    // Initialize git in temp directory
    const git = simpleGit(tempDir);
    await git.init();
    
    // Configure git user
    try {
      await git.addConfig('user.name', owner, false, 'local');
      await git.addConfig('user.email', `${owner}@users.noreply.github.com`, false, 'local');
    } catch (e) {
      // Ignore config errors
    }

    // Add remote
    await git.addRemote('origin', repoUrlWithToken);

    // Add all files and commit
    await git.add('.');
    await git.commit(description || "🚀 Auto-deployed using DeployEase");

    // Push to gh-pages branch (create if doesn't exist)
    try {
      await git.push('origin', `HEAD:${branch}`, ['--force']);
    } catch (pushErr) {
      // Retry with force
      throw pushErr;
    }

    // Cleanup temp directory
    spinner.text = `🧹 Cleaning up...`;
    await fsExtra.remove(tempDir).catch(() => {});

    spinner.succeed(`✅ Successfully deployed ${chalk.yellow(repo)} to GitHub Pages!`);
    console.log(chalk.greenBright(`\n🌍 Visit: https://${owner}.github.io/${repo}/\n`));
    rl.close();
  } catch (err) {
    spinner.fail("❌ Deployment failed.");
    console.error(chalk.redBright(err.stack || err.message));
    rl.close();
  }
}
