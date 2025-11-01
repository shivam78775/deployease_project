import { Command } from "commander";
import init from "./commands/init.js";
import deploy from "./commands/deploy.js";
import redeploy from "./commands/redeploy.js";
import check from "./commands/check.js";
import readme from "./commands/readme.js";

const program = new Command();

program
  .name("deployease")
  .description("CLI tool to auto-deploy static sites to GitHub Pages")
  .version("1.0.0");

program
  .command("init")
  .description("Initialize a new DeployEase configuration")
  .action(init);

program
  .command("deploy")
  .description("Deploy project to GitHub Pages")
  .action(deploy);

program
  .command("redeploy")
  .description("Redeploy using existing config")
  .action(redeploy);

program
  .command("check")
  .description("Analyze code for errors, bugs, and security issues")
  .action(check);

program
  .command("readme")
  .description("Generate README.md file with AI assistance")
  .action(readme);

program.parse(process.argv);
