import chalk from "chalk";
import { clearStoredAuth } from "./login.js";

export default async function logout() {
  console.log(chalk.cyanBright("\n🚪 Logging out...\n"));
  
  if (clearStoredAuth()) {
    console.log(chalk.green("✅ Successfully logged out!"));
    console.log(chalk.gray("   Your stored authentication has been removed.\n"));
  } else {
    console.log(chalk.yellow("⚠️  No stored authentication found.\n"));
  }
}

