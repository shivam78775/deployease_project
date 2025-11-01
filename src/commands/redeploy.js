import chalk from "chalk";
import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import os from "os";
import ora from "ora";
import simpleGit from "simple-git";
import readline from "readline";
import inquirer from "inquirer";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export default async function redeploy() {
  console.log(chalk.cyanBright("\n🔁 Redeploying existing site...\n"));
  const spinner = ora("Loading configuration...").start();

  try {
    // Load configuration
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

    spinner.succeed("✅ Configuration loaded");

    // Verify deploy directory exists
    spinner.start("📂 Verifying deploy directory...");
    const fullPath = path.resolve(process.cwd(), deployDir);
    const normalizedPath = path.normalize(fullPath);

    if (!fs.existsSync(normalizedPath)) {
      spinner.fail(`❌ Directory '${deployDir}' not found.`);
      console.log(
        chalk.yellow(
          `💡 Make sure your build output exists at: ${chalk.cyan(deployDir)}`
        )
      );
      console.log(chalk.yellow("   You may need to run 'deployease deploy' first to build the project."));
      rl.close();
      return;
    }

    const stats = fs.statSync(normalizedPath);
    if (!stats.isDirectory()) {
      spinner.fail(`❌ '${deployDir}' is not a directory.`);
      rl.close();
      return;
    }

    // Verify index.html exists
    const indexHtmlPath = path.join(normalizedPath, "index.html");
    if (!fs.existsSync(indexHtmlPath)) {
      spinner.fail(`❌ index.html not found in '${deployDir}' directory.`);
      rl.close();
      return;
    }

    spinner.succeed(`✅ Deploy directory ready: ${chalk.cyan(normalizedPath)}`);
    console.log();

    // Get GitHub token for authentication
    spinner.start("🔐 Authenticating with GitHub...");
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
    }
    spinner.succeed("✅ Authentication ready");
    console.log();

    // Deploy to GitHub Pages
    spinner.start(
      `🚀 Redeploying ${chalk.cyan(repo)} to ${chalk.cyan(branch)} branch...`
    );
    console.log(chalk.gray(`   📂 Source: ${normalizedPath}`));
    console.log(chalk.gray(`   📦 Repository: ${owner}/${repo}`));
    console.log();

    // Prepare repo URL with token for authentication
    const repoUrlWithToken = `https://${token}@github.com/${owner}/${repo}.git`;

    // Create temporary git repo for deployment
    const tempDir = path.join(os.tmpdir(), `deployease-redeploy-${Date.now()}`);

    spinner.text = `📦 Preparing deployment files...`;

    // Create temp directory and copy files
    await fsExtra.ensureDir(tempDir);

    // Read all files in the deploy directory
    const files = fs.readdirSync(normalizedPath);

    // Copy each file/directory individually
    for (const file of files) {
      const srcPath = path.join(normalizedPath, file);
      const destPath = path.join(tempDir, file);
      const fileStats = fs.statSync(srcPath);

      // Skip .git directories and node_modules
      if (file === ".git" || file === "node_modules") {
        continue;
      }

      if (fileStats.isDirectory()) {
        await fsExtra.copy(srcPath, destPath, {
          filter: (src) => {
            return !src.includes(".git") && !src.includes("node_modules");
          },
        });
      } else {
        await fsExtra.copy(srcPath, destPath);
      }
    }

    // Verify index.html was copied
    const tempIndexHtml = path.join(tempDir, "index.html");
    if (!fs.existsSync(tempIndexHtml)) {
      spinner.fail("❌ Failed to copy index.html to deployment directory.");
      rl.close();
      return;
    }

    spinner.text = `📦 Files ready (${files.length} items)`;

    // Initialize git in temp directory
    const git = simpleGit(tempDir);
    await git.init();

    // Configure git user
    try {
      await git.addConfig("user.name", owner, false, "local");
      await git.addConfig(
        "user.email",
        `${owner}@users.noreply.github.com`,
        false,
        "local"
      );
    } catch (e) {
      // Ignore config errors
    }

    // Add remote
    await git.addRemote("origin", repoUrlWithToken);

    // Add all files and commit
    spinner.text = `📝 Committing files...`;
    console.log(
      chalk.gray(
        `   Files to deploy: ${files.slice(0, 10).join(", ")}${
          files.length > 10 ? ` (+${files.length - 10} more)` : ""
        }`
      )
    );

    // Force add all files
    await git.raw(["add", "-A", "-f", "."]);

    const status = await git.status();
    const totalFiles =
      status.files.length +
      status.not_added.length +
      status.created.length +
      status.deleted.length +
      status.modified.length;

    if (totalFiles === 0 && files.length === 0) {
      spinner.warn("⚠️  No files to commit!");
      rl.close();
      return;
    }

    console.log(chalk.gray(`   Staged ${totalFiles} files for commit...`));

    await git.commit(description || "🚀 Re-deployed using DeployEase");

    // Verify commit was created
    const log = await git.log(["-1"]);
    if (log.total === 0) {
      spinner.fail("❌ Failed to create commit!");
      rl.close();
      return;
    }

    console.log(chalk.gray(`   ✓ Commit created: ${log.latest.hash.substring(0, 7)}`));

    // Push to gh-pages branch
    spinner.text = `🚀 Pushing to ${chalk.cyan(branch)} branch...`;
    try {
      await git.push("origin", `HEAD:${branch}`, ["--force"]);
    } catch (pushErr) {
      throw pushErr;
    }

    // Cleanup temp directory
    spinner.text = `🧹 Cleaning up...`;
    await fsExtra.remove(tempDir).catch(() => {});

    spinner.succeed(`✅ Successfully redeployed ${chalk.yellow(repo)} to GitHub Pages!`);
    console.log(chalk.greenBright(`\n🌍 Visit: https://${owner}.github.io/${repo}/`));
    console.log(
      chalk.gray(`   Note: It may take a few minutes for GitHub Pages to update.\n`)
    );
    rl.close();
  } catch (err) {
    spinner.fail("❌ Redeployment failed.");
    console.error(chalk.redBright(err.stack || err.message));
    rl.close();
  }
}
