import fs from "fs";
import path from "path";
import ora from "ora";
import chalk from "chalk";
import readline from "readline";
import inquirer from "inquirer";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Detect project information for README generation
 */
function detectProjectInfo(cwd) {
  const info = {
    name: "Project",
    description: "",
    type: "static",
    framework: null,
    hasPackageJson: false,
    scripts: {},
    dependencies: {},
    author: "",
    version: "1.0.0",
  };

  // Check package.json
  const packageJsonPath = path.join(cwd, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      info.name = packageJson.name || path.basename(cwd);
      info.description = packageJson.description || "";
      info.hasPackageJson = true;
      info.scripts = packageJson.scripts || {};
      info.dependencies = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
      };
      info.author = packageJson.author || "";
      info.version = packageJson.version || "1.0.0";

      // Detect framework
      if (info.dependencies["react-scripts"]) {
        info.type = "react";
        info.framework = "React (Create React App)";
      } else if (info.dependencies["next"]) {
        info.type = "nextjs";
        info.framework = "Next.js";
      } else if (info.dependencies["vite"]) {
        info.type = "vite";
        info.framework = "Vite";
      } else if (info.dependencies["vue"]) {
        info.type = "vue";
        info.framework = "Vue.js";
      } else if (info.dependencies["@angular/core"]) {
        info.type = "angular";
        info.framework = "Angular";
      }
    } catch (err) {
      // Ignore parse errors
    }
  } else {
    info.name = path.basename(cwd);
  }

  // Check for README
  info.hasReadme = fs.existsSync(path.join(cwd, "README.md"));

  return info;
}

/**
 * Generate README content using AI (OpenAI) or template
 */
async function generateReadme(projectInfo, useAI = false, apiKey = null) {
  if (useAI && apiKey) {
    try {
      const { default: fetch } = await import("node-fetch");
      const spinner = ora("🤖 Generating README with AI...").start();

      const prompt = `Generate a professional README.md file for a ${projectInfo.framework || projectInfo.type} project named "${projectInfo.name}".

Project Details:
- Name: ${projectInfo.name}
- Description: ${projectInfo.description || "No description provided"}
- Framework: ${projectInfo.framework || "Static HTML"}
- Version: ${projectInfo.version}
- Author: ${projectInfo.author || "Not specified"}
${projectInfo.scripts.build ? `- Build Command: ${projectInfo.scripts.build}` : ""}

Include:
1. Project title and description
2. Features list
3. Installation instructions
4. Usage/Getting Started
5. Build and deployment instructions
6. Technologies used
7. License (if available)

Make it professional, well-formatted, and include proper markdown syntax.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "You are a technical writer who creates professional README files for software projects.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      const data = await response.json();
      spinner.succeed("✅ README generated with AI!");
      return data.choices[0].message.content.trim();
    } catch (err) {
      console.log(chalk.yellow(`\n⚠️  AI generation failed: ${err.message}`));
      console.log(chalk.gray("   Falling back to template-based generation...\n"));
      return generateTemplateReadme(projectInfo);
    }
  } else {
    return generateTemplateReadme(projectInfo);
  }
}

/**
 * Generate README from template
 */
function generateTemplateReadme(projectInfo) {
  const buildCommand = projectInfo.scripts.build || "npm run build";
  const installCommand = projectInfo.hasPackageJson ? "npm install" : "# No dependencies required";
  const startCommand = projectInfo.scripts.start
    ? `\`\`\`bash\nnpm start\n\`\`\``
    : "# Static project - open index.html in browser";

  let features = [];
  if (projectInfo.framework) {
    features.push(`Built with ${projectInfo.framework}`);
  }
  features.push("Responsive design");
  features.push("Modern web standards");

  let techStack = [];
  if (projectInfo.framework) techStack.push(projectInfo.framework);
  if (projectInfo.dependencies.react) techStack.push("React");
  if (projectInfo.dependencies.vue) techStack.push("Vue.js");
  if (projectInfo.dependencies.angular) techStack.push("Angular");

  return `# ${projectInfo.name}

${projectInfo.description || "A modern web application"}

## ✨ Features

${features.map((f) => `- ${f}`).join("\n")}

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

\`\`\`bash
${installCommand}
\`\`\`

### Development

\`\`\`bash
${startCommand}
\`\`\`

### Build

\`\`\`bash
${buildCommand}
\`\`\`

## 📦 Deployment

This project can be deployed using [DeployEase](https://github.com/shivam78775/deployease):

\`\`\`bash
# Initialize deployment
deployease init

# Deploy to GitHub Pages
deployease deploy
\`\`\`

## 🛠️ Technologies

${techStack.length > 0 ? techStack.map((t) => `- ${t}`).join("\n") : "- HTML\n- CSS\n- JavaScript"}

## 📝 License

This project is open source and available under the MIT License.

## 👤 Author

${projectInfo.author || "Your Name"}

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

---

Made with ❤️ using DeployEase
`;
}

export default async function readme() {
  console.log(chalk.cyanBright("\n📝 README Generator\n"));
  const spinner = ora("Analyzing project...").start();

  try {
    const cwd = process.cwd();
    const projectInfo = detectProjectInfo(cwd);

    spinner.succeed(`✅ Project detected: ${chalk.cyan(projectInfo.framework || projectInfo.type)}`);
    console.log();

    // Check if README already exists
    const readmePath = path.join(cwd, "README.md");
    if (projectInfo.hasReadme) {
      spinner.stop();
      const overwrite = await inquirer.prompt([
        {
          type: "confirm",
          name: "overwrite",
          message: "README.md already exists. Overwrite?",
          default: false,
        },
      ]);

      if (!overwrite.overwrite) {
        console.log(chalk.yellow("❌ Cancelled. README not generated."));
        rl.close();
        return;
      }
      spinner.start();
    }

    // Ask about AI generation
    spinner.stop();
    const useAI = await inquirer.prompt([
      {
        type: "confirm",
        name: "useAI",
        message: "Use AI to generate README? (requires OpenAI API key)",
        default: false,
      },
    ]);

    let apiKey = null;
    if (useAI.useAI) {
      apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        const keyPrompt = await inquirer.prompt([
          {
            type: "password",
            name: "apiKey",
            message: "Enter your OpenAI API key:",
            mask: "*",
          },
        ]);
        apiKey = keyPrompt.apiKey;
      }
    }

    spinner.start("Generating README...");
    const readmeContent = await generateReadme(projectInfo, useAI.useAI, apiKey);

    // Write README
    fs.writeFileSync(readmePath, readmeContent);
    spinner.succeed(`✅ README.md generated successfully!`);
    console.log(chalk.greenBright(`\n📄 File: ${readmePath}\n`));

    rl.close();
  } catch (err) {
    spinner.fail("❌ README generation failed.");
    console.error(chalk.redBright(err.message));
    rl.close();
  }
}

