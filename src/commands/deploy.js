import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import ghpages from "gh-pages";
import ora from "ora";

export default async function deploy() {
  console.log(chalk.cyan("\n🚀 Starting deployment...\n"));

  const configPath = path.resolve(".deployease.json");

  if (!fs.existsSync(configPath)) {
    console.log(chalk.red("❌ No .deployease.json found! Run 'deployease init' first."));
    return;
  }

  const config = await fs.readJson(configPath);
  const spinner = ora("Deploying to GitHub Pages...").start();

  try {
    await new Promise((resolve, reject) => {
      ghpages.publish(
        path.resolve(config.build),
        {
          branch: "gh-pages",
          repo: config.repo,
          message: "DeployEase auto-deploy 🚀",
        },
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    spinner.succeed(chalk.green("✅ Deployment successful!"));
    console.log(chalk.cyan(`🌐 Deployed to: ${config.repo.replace(".git", "")}/tree/gh-pages`));
  } catch (err) {
    spinner.fail(chalk.red("❌ Deployment failed."));
    console.error(err);
  }
}
