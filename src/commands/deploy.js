import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import os from "os";
import ora from "ora";
import chalk from "chalk";
import simpleGit from "simple-git";
import readline from "readline";
import inquirer from "inquirer";
import { execSync } from "child_process";
import { analyzeCode } from "./check.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Detect project type and return build configuration
 */
function detectProjectType() {
  const cwd = process.cwd();
  const packageJsonPath = path.join(cwd, "package.json");
  const indexHtmlPath = path.join(cwd, "index.html");

  // Check if package.json exists
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      const deps = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
      };

      // React (Create React App)
      if (deps["react-scripts"]) {
        return {
          type: "react",
          buildCmd: "npm run build",
          deployDir: "build",
          description: "React (Create React App) project",
        };
      }

      // Next.js
      if (deps["next"]) {
        // Check if export script exists
        const hasExportScript = packageJson.scripts && packageJson.scripts.export;
        const buildCmd = hasExportScript 
          ? "npm run build && npm run export"
          : "npm run build";
        
        return {
          type: "nextjs",
          buildCmd,
          deployDir: "out",
          description: "Next.js project",
        };
      }

      // Vite
      if (deps["vite"]) {
        return {
          type: "vite",
          buildCmd: "npm run build",
          deployDir: "dist",
          description: "Vite project",
        };
      }

      // Vue
      if (deps["vue"] || deps["@vue/cli-service"]) {
        return {
          type: "vue",
          buildCmd: "npm run build",
          deployDir: "dist",
          description: "Vue project",
        };
      }

      // Angular
      if (deps["@angular/core"]) {
        return {
          type: "angular",
          buildCmd: "npm run build",
          deployDir: "dist",
          description: "Angular project",
        };
      }

      // Generic Node.js with build script
      if (packageJson.scripts && packageJson.scripts.build) {
        // Check for common output directories
        const possibleDirs = ["dist", "build", "out", "public"];
        const deployDir = possibleDirs.find((dir) =>
          fs.existsSync(path.join(cwd, dir))
        ) || "dist";

        return {
          type: "node",
          buildCmd: "npm run build",
          deployDir,
          description: "Node.js project with build script",
        };
      }

      // If package.json exists but no build script, fall through to static check
    } catch (err) {
      // If package.json parsing fails, continue to static check
    }
  }

  // Simple Static HTML (index.html exists and no package.json)
  if (!fs.existsSync(packageJsonPath) && fs.existsSync(indexHtmlPath)) {
    return {
      type: "static",
      buildCmd: null,
      deployDir: ".",
      description: "Static HTML project",
    };
  }

  // Default to static
  return {
    type: "static",
    buildCmd: null,
    deployDir: ".",
    description: "Static project",
  };
}

export default async function deploy() {
  console.log(chalk.cyanBright("\n🚀 Starting deployment...\n"));
  const spinner = ora("Detecting project type...").start();

  try {
    // Step 0: Quick security check (optional - can be skipped)
    spinner.stop();
    const runCheck = await inquirer.prompt([
      {
        type: "confirm",
        name: "check",
        message: "Run security check before deploying?",
        default: true,
      },
    ]);

    if (runCheck.check) {
      spinner.start("🔍 Running pre-deployment checks...");
      const cwd = process.cwd();
      const analysis = analyzeCode(cwd);

      if (analysis.issues.length > 0) {
        spinner.warn(`⚠️  Found ${analysis.issues.length} critical issue(s)`);
        console.log(chalk.yellow("\n⚠️  Critical issues detected before deployment:\n"));
        analysis.issues.slice(0, 3).forEach((issue) => {
          console.log(chalk.red(`   • ${issue.message}`));
          console.log(chalk.gray(`     Solution: ${issue.solution}`));
        });
        if (analysis.issues.length > 3) {
          console.log(chalk.gray(`   ... and ${analysis.issues.length - 3} more issues`));
        }
        console.log();

        const continueDeploy = await inquirer.prompt([
          {
            type: "confirm",
            name: "continue",
            message: "Continue with deployment anyway?",
            default: false,
          },
        ]);

        if (!continueDeploy.continue) {
          console.log(chalk.yellow("\n💡 Run 'deployease check' for detailed analysis\n"));
          rl.close();
          return;
        }
      } else {
        spinner.succeed("✅ Security check passed!");
      }
      console.log();
    }

    spinner.start("Detecting project type...");

    // Step 1: Detect project type
    spinner.start("🔍 Detecting project type...");
    const projectInfo = detectProjectType();
    spinner.succeed(
      `✅ Detected: ${chalk.cyan(projectInfo.description)} ${chalk.gray(`(${projectInfo.type})`)}`
    );

    console.log(
      chalk.gray(`   📦 Build command: ${projectInfo.buildCmd || "None"}`)
    );
    console.log(
      chalk.gray(`   📁 Deploy directory: ${chalk.cyan(projectInfo.deployDir)}`)
    );
    console.log();

    // Step 2: Load config
    spinner.start("📋 Loading configuration...");
    const configPath = path.resolve(".deployease.json");
    if (!fs.existsSync(configPath)) {
      spinner.fail("❌ No .deployease.json found!");
      console.log(chalk.yellow("💡 Run 'deployease init' first.\n"));
      rl.close();
      return;
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const { repo, owner, branch = "gh-pages", deployDir: configDeployDir = ".", description, repoUrl } = config;

    // Use detected deployDir if different from config
    let deployDir = projectInfo.deployDir;
    if (configDeployDir !== projectInfo.deployDir) {
      console.log(
        chalk.yellow(
          `⚠️  Deploy directory updated: ${configDeployDir} → ${deployDir}`
        )
      );
      // Update config
      config.deployDir = deployDir;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(chalk.gray("   📝 Configuration updated.\n"));
    }

    // For React apps, ensure homepage is set in package.json
    if (projectInfo.type === "react") {
      const packageJsonPath = path.join(process.cwd(), "package.json");
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        const expectedHomepage = `https://${owner}.github.io/${repo}`;
        
        if (!packageJson.homepage || packageJson.homepage !== expectedHomepage) {
          spinner.stop();
          console.log(chalk.yellow("\n⚠️  React apps need 'homepage' field for GitHub Pages"));
          console.log(chalk.gray(`   Setting homepage to: ${expectedHomepage}`));
          
          packageJson.homepage = expectedHomepage;
          fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
          console.log(chalk.green("   ✓ Updated package.json\n"));
          spinner.start();
        }
      }
    }

    spinner.succeed("✅ Configuration loaded");

    if (!repo || !owner) {
      spinner.fail("❌ Missing repo or owner in .deployease.json");
      rl.close();
      return;
    }

    // Step 3: Build project if needed
    if (projectInfo.buildCmd) {
      spinner.start(`🔨 Building project: ${chalk.cyan(projectInfo.buildCmd)}...`);
      try {
        // Execute build command with shell support for compound commands (&&)
        execSync(projectInfo.buildCmd, {
          cwd: process.cwd(),
          stdio: "inherit",
          shell: true,
          env: { ...process.env, NODE_ENV: "production" },
        });
        spinner.succeed(`✅ Build completed successfully!`);
        console.log();
      } catch (buildErr) {
        spinner.fail("❌ Build failed!");
        console.error(chalk.redBright(`\nBuild Error: ${buildErr.message}`));
        if (buildErr.stderr) {
          console.error(chalk.redBright(buildErr.stderr.toString()));
        }
        console.log(chalk.yellow("\n💡 Fix the build errors and try again."));
        rl.close();
        return;
      }
    } else {
      console.log(chalk.gray("⏭️  No build step required for static projects.\n"));
    }

    // Step 4: Verify deploy directory
    spinner.start("📂 Verifying deploy directory...");
    const fullPath = path.resolve(process.cwd(), deployDir);
    const normalizedPath = path.normalize(fullPath);

    if (!fs.existsSync(normalizedPath)) {
      spinner.fail(`❌ Directory '${deployDir}' not found after build.`);
      console.log(
        chalk.yellow(
          `💡 Make sure your build process outputs to: ${chalk.cyan(deployDir)}`
        )
      );
      rl.close();
      return;
    }

    const stats = fs.statSync(normalizedPath);
    if (!stats.isDirectory()) {
      spinner.fail(`❌ '${deployDir}' is not a directory.`);
      rl.close();
      return;
    }

    // Verify index.html exists in deploy directory (required for GitHub Pages)
    const indexHtmlPath = path.join(normalizedPath, "index.html");
    if (!fs.existsSync(indexHtmlPath)) {
      spinner.fail(`❌ index.html not found in '${deployDir}' directory.`);
      console.log(
        chalk.yellow(
          `💡 GitHub Pages requires an index.html file at the root of the deployment.`
        )
      );
      console.log(chalk.gray(`   Checked: ${indexHtmlPath}`));
      
      // List what files are in the directory
      try {
        const files = fs.readdirSync(normalizedPath);
        console.log(chalk.gray(`   Files found: ${files.slice(0, 10).join(", ")}${files.length > 10 ? "..." : ""}`));
      } catch (e) {
        // Ignore
      }
      
      rl.close();
      return;
    }

    spinner.succeed(`✅ Deploy directory ready: ${chalk.cyan(normalizedPath)}`);
    console.log(chalk.gray(`   ✓ index.html found`));
    console.log();

    // Step 5: Get GitHub token for authentication
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

    // Step 6: Deploy to GitHub Pages
    spinner.start(
      `🚀 Deploying ${chalk.cyan(repo)} to ${chalk.cyan(branch)} branch...`
    );
    console.log(chalk.gray(`   📂 Source: ${normalizedPath}`));
    console.log(chalk.gray(`   📦 Repository: ${owner}/${repo}`));
    console.log();

    // Prepare repo URL with token for authentication
    const repoUrlWithToken = `https://${token}@github.com/${owner}/${repo}.git`;

    // Use git from the project root, not the deploy directory
    // We'll create a temporary git repo in a temp directory to avoid conflicts
    const tempDir = path.join(os.tmpdir(), `deployease-${Date.now()}`);
    
    spinner.text = `📦 Preparing deployment files...`;
    
    // Create temp directory and copy files
    // IMPORTANT: Copy contents of normalizedPath to tempDir (not the directory itself)
    await fsExtra.ensureDir(tempDir);
    
    // Read all files in the deploy directory
    const files = fs.readdirSync(normalizedPath);
    
    // Copy each file/directory individually to avoid copying the parent directory
    for (const file of files) {
      const srcPath = path.join(normalizedPath, file);
      const destPath = path.join(tempDir, file);
      const fileStats = fs.statSync(srcPath);
      
      // Skip .git directories and node_modules
      if (file === '.git' || file === 'node_modules') {
        continue;
      }
      
      if (fileStats.isDirectory()) {
        await fsExtra.copy(srcPath, destPath, {
          filter: (src) => {
            // Don't copy .git directories or node_modules
            return !src.includes('.git') && !src.includes('node_modules');
          }
        });
      } else {
        await fsExtra.copy(srcPath, destPath);
      }
    }
    
    // Verify index.html was copied
    const tempIndexHtml = path.join(tempDir, "index.html");
    if (!fs.existsSync(tempIndexHtml)) {
      spinner.fail("❌ Failed to copy index.html to deployment directory.");
      console.log(chalk.red(`   Expected: ${tempIndexHtml}`));
      try {
        const tempFiles = fs.readdirSync(tempDir);
        console.log(chalk.gray(`   Files in temp dir: ${tempFiles.join(", ")}`));
      } catch (e) {
        // Ignore
      }
      rl.close();
      return;
    }
    
    spinner.text = `📦 Files ready (${files.length} items)`;
    
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
    spinner.text = `📝 Committing files...`;
    
    // List files in temp directory for debugging
    const tempFiles = fs.readdirSync(tempDir);
    console.log(chalk.gray(`   Files to deploy: ${tempFiles.slice(0, 10).join(", ")}${tempFiles.length > 10 ? ` (+${tempFiles.length - 10} more)` : ""}`));
    
    // Force add all files (including ignored ones for deployment)
    await git.raw(['add', '-A', '-f', '.']);
    
    // Check what files are being committed
    const statusBefore = await git.status();
    
    // Count all tracked and untracked files
    const totalFiles = statusBefore.files.length + 
                       statusBefore.not_added.length + 
                       statusBefore.created.length +
                       statusBefore.deleted.length +
                       statusBefore.modified.length;
    
    if (totalFiles === 0) {
      spinner.warn("⚠️  No files detected by git!");
      console.log(chalk.yellow("   This might indicate a problem with file copying."));
      console.log(chalk.gray(`   Files in temp dir: ${tempFiles.length}`));
      
      // Try listing with ls-files
      try {
        const lsFiles = await git.raw(['ls-files']);
        console.log(chalk.gray(`   Git tracked files: ${lsFiles ? "some" : "none"}`));
      } catch (e) {
        // Ignore
      }
      
      // Still try to commit if files exist
      if (tempFiles.length > 0) {
        console.log(chalk.yellow("   Attempting to commit anyway..."));
      } else {
        rl.close();
        return;
      }
    } else {
      console.log(chalk.gray(`   Staged ${totalFiles} files for commit...`));
    }
    
    await git.commit(description || "🚀 Auto-deployed using DeployEase");
    
    // Verify commit was created
    const log = await git.log(['-1']);
    if (log.total === 0) {
      spinner.fail("❌ Failed to create commit!");
      rl.close();
      return;
    }
    
    console.log(chalk.gray(`   ✓ Commit created: ${log.latest.hash.substring(0, 7)}`));
    console.log(chalk.gray(`   ✓ Message: ${log.latest.message}`));

    // Push to gh-pages branch (create if doesn't exist)
    spinner.text = `🚀 Pushing to ${chalk.cyan(branch)} branch...`;
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
    console.log(chalk.greenBright(`\n🌍 Visit: https://${owner}.github.io/${repo}/`));
    console.log(chalk.gray(`   Note: It may take a few minutes for GitHub Pages to update.\n`));
    rl.close();
  } catch (err) {
    spinner.fail("❌ Deployment failed.");
    console.error(chalk.redBright(err.stack || err.message));
    rl.close();
  }
}
