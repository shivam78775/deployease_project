import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import ghpages from "gh-pages";
import ora from "ora";

export default async function redeploy() {
  console.log(chalk.cyan("\n🔁 Redeploying existing site...\n"));

  const configPath = path.resolve(".deployease.json");

  if (!fs.existsSync(configPath)) {
    console.log(chalk.red("❌ No config found. Run 'deployease init' first."));
    return;
  }

  const config = await fs.readJson(configPath);
  const spinner = ora("Re-deploying to GitHub Pages...").start();

  try {
    await new Promise((resolve, reject) => {
      ghpages.publish(
        path.resolve(config.build),
        {
          branch: "gh-pages",
          repo: config.repo,
          message: "DeployEase re-deploy 🔁",
          dotfiles: true,
        },
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    spinner.succeed(chalk.green("✅ Redeployment successful!"));
  } catch (err) {
    spinner.fail(chalk.red("❌ Redeployment failed."));
    console.error(err);
  }
}
