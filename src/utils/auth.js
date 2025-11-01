import { getStoredAuth } from "../commands/login.js";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";

/**
 * Get GitHub token - checks stored auth first, then environment, then prompts
 */
export async function getGitHubToken(promptIfMissing = true) {
  // 1. Check stored authentication
  const storedToken = getStoredAuth();
  if (storedToken) {
    return storedToken;
  }

  // 2. Check environment variable
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  // 3. Prompt user if allowed
  if (promptIfMissing) {
    const spinner = ora();
    spinner.stop();
    console.log(chalk.yellow("\n⚠️  Not logged in. Please login first."));
    console.log(chalk.gray("   Run: deployease login\n"));
    
    const loginNow = await inquirer.prompt([
      {
        type: "confirm",
        name: "login",
        message: "Login now?",
        default: true,
      },
    ]);

    if (loginNow.login) {
      // Import and run login
      try {
        const { default: login } = await import("../commands/login.js");
        await login();
        
        // Try getting token again after login
        const newToken = getStoredAuth();
        if (newToken) {
          return newToken;
        }
      } catch (err) {
        console.log(chalk.yellow("⚠️  Login cancelled or failed."));
      }
    }

    // If user didn't login or login failed, return null
    return null;
  }

  return null;
}

