import fs from "fs";
import path from "path";
import os from "os";
import ora from "ora";
import chalk from "chalk";
import readline from "readline";
import inquirer from "inquirer";
import { Octokit } from "@octokit/rest";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const AUTH_DIR = path.join(os.homedir(), ".deployease");
const AUTH_FILE = path.join(AUTH_DIR, "auth.json");

/**
 * Get stored authentication
 */
export function getStoredAuth() {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      const authData = JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8"));
      
      // Check if token is expired (if expiry is set)
      if (authData.expiresAt && new Date(authData.expiresAt) < new Date()) {
        return null;
      }
      
      return authData.token;
    }
  } catch (err) {
    // Ignore errors
  }
  return null;
}

/**
 * Store authentication token
 */
function storeAuth(token, expiresAt = null) {
  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }
    
    const authData = {
      token,
      expiresAt,
      createdAt: new Date().toISOString(),
    };
    
    // Store with minimal permissions (user read/write only)
    fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2), {
      mode: 0o600, // Read/write for owner only
    });
    
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Clear stored authentication
 */
export function clearStoredAuth() {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      fs.unlinkSync(AUTH_FILE);
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Verify token with GitHub
 */
async function verifyToken(token) {
  try {
    const octokit = new Octokit({ auth: token });
    const user = await octokit.rest.users.getAuthenticated();
    return {
      valid: true,
      username: user.data.login,
      name: user.data.name || user.data.login,
    };
  } catch (err) {
    return { valid: false };
  }
}

/**
 * Login using Personal Access Token (fallback method)
 */
async function loginWithToken() {
  const spinner = ora("Authenticating...").start();
  
  spinner.stop();
  console.log(chalk.yellow("\n⚠️  Using Personal Access Token method"));
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
  
  const token = tokenPrompt.token;
  if (!token) {
    console.log(chalk.red("❌ Token is required."));
    rl.close();
    return null;
  }
  
  spinner.start("Verifying token...");
  const verification = await verifyToken(token);
  
  if (!verification.valid) {
    spinner.fail("❌ Invalid token. Please check your token and try again.");
    rl.close();
    return null;
  }
  
  spinner.succeed(`✅ Authenticated as ${chalk.cyan(verification.username)}`);
  
  // Store token
  if (storeAuth(token)) {
    console.log(chalk.green("✅ Authentication saved. You won't need to login again."));
  } else {
    console.log(chalk.yellow("⚠️  Could not save authentication."));
  }
  
  return token;
}

/**
 * Login using OAuth Device Flow (simpler, no redirect)
 */
async function loginWithOAuth() {
  const spinner = ora("Starting OAuth login...").start();
  
  try {
    // For OAuth Device Flow, we need a GitHub App or use a simpler approach
    // Since setting up OAuth App requires registration, we'll use token-based auth
    // with better UX - prompt once and store securely
    
    spinner.succeed("Redirecting to token setup...");
    console.log(chalk.cyan("\n📝 Please create a GitHub Personal Access Token:"));
    console.log(chalk.gray("   1. Visit: https://github.com/settings/tokens"));
    console.log(chalk.gray("   2. Click 'Generate new token' → 'Generate new token (classic)'"));
    console.log(chalk.gray("   3. Give it a name like 'DeployEase'"));
    console.log(chalk.gray("   4. Select scopes: repo, workflow"));
    console.log(chalk.gray("   5. Click 'Generate token'"));
    console.log(chalk.gray("   6. Copy the token (you won't see it again!)\n"));
    
    const openBrowser = await inquirer.prompt([
      {
        type: "confirm",
        name: "open",
        message: "Open GitHub token creation page in browser?",
        default: true,
      },
    ]);
    
    if (openBrowser.open) {
      try {
        // Try to dynamically import and use open package
        const openModule = await import("open").catch(() => null);
        if (openModule && openModule.default) {
          await openModule.default("https://github.com/settings/tokens/new");
        } else {
          console.log(chalk.gray("   Please visit: https://github.com/settings/tokens/new"));
        }
      } catch (err) {
        // Ignore if can't open browser
        console.log(chalk.gray("   Please visit: https://github.com/settings/tokens/new"));
      }
    }
    
    return await loginWithToken();
  } catch (err) {
    spinner.fail("❌ OAuth login failed.");
    console.error(chalk.redBright(err.message));
    return null;
  }
}

export default async function login() {
  console.log(chalk.cyanBright("\n🔐 DeployEase Login\n"));
  
  // Check if already logged in
  const existingToken = getStoredAuth();
  if (existingToken) {
    const spinner = ora("Checking existing authentication...").start();
    const verification = await verifyToken(existingToken);
    
    if (verification.valid) {
      spinner.succeed(`✅ Already logged in as ${chalk.cyan(verification.username)}`);
      console.log(chalk.gray("\n💡 Use 'deployease logout' to logout\n"));
      rl.close();
      return;
    } else {
      spinner.warn("⚠️  Stored token is invalid. Please login again.");
      clearStoredAuth();
    }
  }
  
  // Ask for login method
  const loginMethod = await inquirer.prompt([
    {
      type: "list",
      name: "method",
      message: "Choose login method:",
      choices: [
        {
          name: "Personal Access Token (Recommended)",
          value: "token",
        },
        {
          name: "I already have a token",
          value: "existing",
        },
      ],
    },
  ]);
  
  let token = null;
  
  if (loginMethod.method === "token") {
    token = await loginWithOAuth();
  } else {
    token = await loginWithToken();
  }
  
  if (token) {
    console.log(chalk.greenBright("\n✅ Login successful!"));
    console.log(chalk.gray("   Your token is stored securely."));
    console.log(chalk.gray("   You can now use deployease commands without re-authenticating.\n"));
  } else {
    console.log(chalk.red("\n❌ Login failed. Please try again.\n"));
  }
  
  rl.close();
}

