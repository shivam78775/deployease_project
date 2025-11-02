import chalk from "chalk";
import inquirer from "inquirer";
import readline from "readline";
import ora from "ora";
import fs from "fs";
import path from "path";
import ChatAssistant from "../services/chatAssistant.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Chat-based Developer Assistant Command
 * Provides interactive Q&A about build failures, routing issues, deployment problems, etc.
 */
export default async function chat() {
  console.log(chalk.cyanBright("\n💬 DeployEase Developer Assistant\n"));
  console.log(chalk.gray("Ask me about build failures, routing issues, 404 errors, and more!\n"));
  console.log(chalk.gray("Type 'exit' or 'quit' to leave, or 'help' for example questions.\n"));

  const spinner = ora("Analyzing your project...").start();
  const assistant = new ChatAssistant(process.cwd());
  const context = assistant.gatherContext();
  spinner.succeed(`✅ Project analyzed: ${context.framework || "Static"} project`);

  if (context.framework) {
    console.log(chalk.gray(`   Framework: ${context.framework}`));
    console.log(chalk.gray(`   Build directory: ${context.buildDir || "Not detected"}`));
    if (context.hasRouting) {
      console.log(chalk.gray(`   Routing: ${context.routingType}`));
    }
  }

  // Check if there are stored build errors
  const errorLogPath = path.join(process.cwd(), ".deployease-build-error.log");
  if (fs.existsSync(errorLogPath)) {
    console.log(chalk.yellow(`   ⚠️  Recent build errors detected - I can help analyze them!`));
  }

  // Check if there are analyzed issues
  if (context.analyzedIssues && context.analyzedIssues.length > 0) {
    console.log(chalk.cyan(`   🤖 AI detected ${context.analyzedIssues.length} issue(s) - Ask "Why did my build fail?" for details`));
  }

  console.log();

  // Main chat loop
  while (true) {
    try {
      const { question } = await inquirer.prompt([
        {
          type: "input",
          name: "question",
          message: chalk.cyan("🤔 Your question:"),
          validate: (input) => {
            if (!input || input.trim().length === 0) {
              return "Please enter a question";
            }
            return true;
          },
        },
      ]);

      const questionLower = question.toLowerCase().trim();

      // Handle exit commands
      if (questionLower === "exit" || questionLower === "quit" || questionLower === "q") {
        console.log(chalk.green("\n👋 Goodbye! Happy coding!\n"));
        rl.close();
        return;
      }

      // Handle help command
      if (questionLower === "help" || questionLower === "examples" || questionLower === "h") {
        showHelp();
        continue;
      }

      // Get answer from assistant
      const answerSpinner = ora("Analyzing your question...").start();
      const answer = await assistant.answerQuestion(question);
      answerSpinner.succeed("Analysis complete");

      // Display answer
      console.log(chalk.cyan("\n" + "─".repeat(60)));
      console.log(chalk.yellowBright("\n📝 Answer:\n"));
      console.log(chalk.white(formatAnswer(answer)));
      console.log(chalk.cyan("\n" + "─".repeat(60)));
      console.log();

      // Ask if they want to continue
      const { continueChat } = await inquirer.prompt([
        {
          type: "confirm",
          name: "continueChat",
          message: "Ask another question?",
          default: true,
        },
      ]);

      if (!continueChat) {
        console.log(chalk.green("\n👋 Goodbye! Happy coding!\n"));
        rl.close();
        return;
      }

      console.log();
    } catch (error) {
      if (error.isTtyError) {
        console.error(chalk.red("\n❌ Error: Prompt couldn't be rendered in the current environment"));
        rl.close();
        return;
      }

      // Handle Ctrl+C
      if (error.message && error.message.includes("cancel")) {
        console.log(chalk.green("\n\n👋 Goodbye! Happy coding!\n"));
        rl.close();
        return;
      }

      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      console.log();
    }
  }
}

/**
 * Show help with example questions
 */
function showHelp() {
  console.log(chalk.cyan("\n" + "─".repeat(60)));
  console.log(chalk.yellowBright("\n📚 Example Questions:\n"));
  console.log(chalk.white("  • Why did my build fail?"));
  console.log(chalk.white("  • What's the issue with my routing?"));
  console.log(chalk.white("  • How do I fix the 404 after deployment?"));
  console.log(chalk.white("  • Build errors"));
  console.log(chalk.white("  • Deployment issues"));
  console.log(chalk.white("  • Missing dependencies"));
  console.log(chalk.white("  • Module not found"));
  console.log(chalk.white("  • Syntax errors"));
  console.log(chalk.white("  • Routing problems"));
  console.log(chalk.cyan("\n" + "─".repeat(60)));
  console.log();
}

/**
 * Format answer for better display
 */
function formatAnswer(answer) {
  // Split by markdown headers and format
  const lines = answer.split("\n");
  let formatted = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Format headers
    if (line.startsWith("**") && line.endsWith("**")) {
      formatted += chalk.bold.cyan(line.replace(/\*\*/g, "")) + "\n";
    }
    // Format code blocks
    else if (line.startsWith("```")) {
      const lang = line.substring(3).trim();
      formatted += chalk.gray("```" + (lang || "")) + "\n";
      i++;
      // Collect code lines
      while (i < lines.length && !lines[i].startsWith("```")) {
        formatted += chalk.green("   " + lines[i]) + "\n";
        i++;
      }
      formatted += chalk.gray("```") + "\n";
    }
    // Format inline code
    else if (line.includes("`")) {
      formatted += line.replace(/`([^`]+)`/g, (match, code) => {
        return chalk.green("`" + code + "`");
      }) + "\n";
    }
    // Format bullet points
    else if (line.trim().startsWith("•") || line.trim().startsWith("-")) {
      formatted += chalk.yellow("   " + line.trim()) + "\n";
    }
    // Format numbered lists
    else if (/^\d+\.\s/.test(line.trim())) {
      formatted += chalk.white(line) + "\n";
    }
    // Format checkmarks
    else if (line.includes("✓") || line.includes("✅")) {
      formatted += chalk.green("   " + line.trim()) + "\n";
    }
    // Format warnings
    else if (line.includes("⚠️") || line.startsWith("Issue")) {
      formatted += chalk.yellow("   " + line) + "\n";
    }
    // Regular text
    else {
      formatted += line + "\n";
    }
  }

  return formatted;
}

