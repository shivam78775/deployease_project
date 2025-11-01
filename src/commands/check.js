import fs from "fs";
import path from "path";
import ora from "ora";
import chalk from "chalk";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function findFiles(dir, extensions, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules, .git, and build directories
      if (
        !["node_modules", ".git", "dist", "build", ".next", ".cache"].includes(file)
      ) {
        findFiles(filePath, extensions, fileList);
      }
    } else {
      const ext = path.extname(file);
      if (extensions.includes(ext)) {
        fileList.push(filePath);
      }
    }
  });

  return fileList;
}

/**
 * Analyze code for errors, bugs, and security issues
 */
export function analyzeCode(cwd) {
  const issues = [];
  const warnings = [];
  const suggestions = [];

  // Check for package.json
  const packageJsonPath = path.join(cwd, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

      // Check for security vulnerabilities in dependencies
      const deps = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
      };

      // Check for known problematic packages
      const problematicPackages = ["serialize-javascript", "moment", "lodash"];
      problematicPackages.forEach((pkg) => {
        if (deps[pkg]) {
          warnings.push({
            type: "dependency",
            severity: "medium",
            message: `Package "${pkg}" detected - consider updating to latest version`,
            solution: `Run: npm update ${pkg} or consider alternatives`,
          });
        }
      });

      // Check for missing homepage field (React apps)
      if (deps["react-scripts"] && !packageJson.homepage) {
        issues.push({
          type: "configuration",
          severity: "high",
          message: "React app missing 'homepage' field in package.json",
          solution:
            "Add 'homepage' field to package.json for GitHub Pages: " +
            '"homepage": "https://yourusername.github.io/your-repo"',
        });
      }

      // Check for security scripts
      if (!packageJson.scripts || !packageJson.scripts.build) {
        warnings.push({
          type: "build",
          severity: "low",
          message: "No build script found in package.json",
          solution: 'Add build script: "build": "your-build-command"',
        });
      }
    } catch (err) {
      issues.push({
        type: "parse",
        severity: "high",
        message: "Invalid package.json file",
        solution: "Fix JSON syntax errors in package.json",
      });
    }
  }

  // Check for sensitive files
  const sensitiveFiles = [".env", ".env.local", ".env.production", "secrets.json"];
  sensitiveFiles.forEach((file) => {
    const filePath = path.join(cwd, file);
    if (fs.existsSync(filePath)) {
      issues.push({
        type: "security",
        severity: "critical",
        message: `Sensitive file "${file}" found in project`,
        solution: `Add "${file}" to .gitignore and use environment variables instead`,
      });
    }
  });

  // Check for .gitignore
  const gitignorePath = path.join(cwd, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    warnings.push({
      type: "git",
      severity: "medium",
      message: ".gitignore file not found",
      solution: "Create .gitignore to exclude node_modules, build files, and sensitive data",
    });
  } else {
    const gitignore = fs.readFileSync(gitignorePath, "utf-8");
    const requiredEntries = ["node_modules", ".env", "dist", "build"];
    requiredEntries.forEach((entry) => {
      if (!gitignore.includes(entry)) {
        warnings.push({
          type: "git",
          severity: "low",
          message: `.gitignore missing "${entry}"`,
          solution: `Add "${entry}/" to .gitignore`,
        });
      }
    });
  }

  // Check for common security issues in HTML files
  const htmlFiles = findFiles(cwd, [".html"]);
  htmlFiles.forEach((htmlFile) => {
    try {
      const content = fs.readFileSync(htmlFile, "utf-8");

      // Check for inline scripts with potential XSS
      if (content.includes("<script>") && content.includes("innerHTML")) {
        warnings.push({
          type: "security",
          severity: "medium",
          message: `Potential XSS vulnerability in ${path.basename(htmlFile)}`,
          solution:
            "Avoid using innerHTML with user input. Use textContent or sanitize input.",
        });
      }

      // Check for hardcoded API keys
      const apiKeyPatterns = [
        /api[_-]?key["\s:=]+["']([a-zA-Z0-9_-]{20,})["']/gi,
        /secret[_-]?key["\s:=]+["']([a-zA-Z0-9_-]{20,})["']/gi,
      ];
      apiKeyPatterns.forEach((pattern) => {
        if (pattern.test(content)) {
          issues.push({
            type: "security",
            severity: "critical",
            message: `Possible API key found in ${path.basename(htmlFile)}`,
            solution: "Move API keys to environment variables or backend, never expose in frontend",
          });
        }
      });

      // Check for HTTP links (should use HTTPS)
      if (content.match(/http:\/\/(?!localhost)/g)) {
        warnings.push({
          type: "security",
          severity: "medium",
          message: `HTTP links found in ${path.basename(htmlFile)} (use HTTPS)`,
          solution: "Replace http:// with https:// for security",
        });
      }
    } catch (err) {
      // Ignore read errors
    }
  });

  // Check for JavaScript files
  const jsFiles = findFiles(cwd, [".js", ".jsx", ".ts", ".tsx"]);
  jsFiles.forEach((jsFile) => {
    try {
      const content = fs.readFileSync(jsFile, "utf-8");

      // Check for eval() usage (security risk)
      if (content.includes("eval(")) {
        issues.push({
          type: "security",
          severity: "high",
          message: `eval() usage found in ${path.basename(jsFile)}`,
          solution: "Avoid eval() - it's a security risk. Use JSON.parse() or other safe alternatives",
        });
      }

      // Check for console.log in production
      if (content.includes("console.log") && (jsFile.includes("dist") || jsFile.includes("build"))) {
        warnings.push({
          type: "code-quality",
          severity: "low",
          message: `console.log found in build file ${path.basename(jsFile)}`,
          solution: "Remove console.log statements or use a build tool to strip them",
        });
      }

      // Check for TODO/FIXME comments
      const todoMatches = content.match(/TODO|FIXME|XXX/gi);
      if (todoMatches) {
        warnings.push({
          type: "code-quality",
          severity: "low",
          message: `${todoMatches.length} TODO/FIXME comments found in ${path.basename(jsFile)}`,
          solution: "Review and address TODO/FIXME comments before deployment",
        });
      }
    } catch (err) {
      // Ignore read errors
    }
  });

  // Deployment-specific checks
  suggestions.push({
    type: "deployment",
    message: "Ensure all environment variables are set correctly",
    solution: "Use environment variables for API keys and sensitive data",
  });

  suggestions.push({
    type: "deployment",
    message: "Test your build locally before deploying",
    solution: "Run 'npm run build' and test the build folder locally",
  });

  suggestions.push({
    type: "deployment",
    message: "Enable GitHub Pages in repository settings",
    solution: "Go to Settings → Pages and select 'gh-pages' branch as source",
  });

  return { issues, warnings, suggestions };
}

export default async function check() {
  console.log(chalk.cyanBright("\n🔍 Analyzing your project...\n"));
  const spinner = ora("Scanning files...").start();

  try {
    const cwd = process.cwd();
    const analysis = analyzeCode(cwd);

    spinner.succeed("✅ Analysis complete!");
    console.log();

    // Display critical issues
    if (analysis.issues.length > 0) {
      console.log(chalk.redBright(`\n❌ Found ${analysis.issues.length} critical issue(s):\n`));
      analysis.issues.forEach((issue, index) => {
        console.log(chalk.red(`${index + 1}. [${issue.type.toUpperCase()}] ${issue.message}`));
        console.log(chalk.yellow(`   Solution: ${issue.solution}`));
        console.log();
      });
    }

    // Display warnings
    if (analysis.warnings.length > 0) {
      console.log(chalk.yellowBright(`\n⚠️  Found ${analysis.warnings.length} warning(s):\n`));
      analysis.warnings.slice(0, 10).forEach((warning, index) => {
        console.log(chalk.yellow(`${index + 1}. [${warning.type.toUpperCase()}] ${warning.message}`));
        console.log(chalk.gray(`   Solution: ${warning.solution}`));
        console.log();
      });
      if (analysis.warnings.length > 10) {
        console.log(chalk.gray(`   ... and ${analysis.warnings.length - 10} more warnings\n`));
      }
    }

    // Display suggestions
    if (analysis.suggestions.length > 0) {
      console.log(chalk.cyanBright(`\n💡 Suggestions for safe deployment:\n`));
      analysis.suggestions.forEach((suggestion, index) => {
        console.log(chalk.cyan(`${index + 1}. ${suggestion.message}`));
        console.log(chalk.gray(`   ${suggestion.solution}`));
        console.log();
      });
    }

    // Summary
    if (analysis.issues.length === 0 && analysis.warnings.length === 0) {
      console.log(chalk.greenBright("\n✅ No critical issues found! Your project looks safe to deploy.\n"));
    } else {
      console.log(chalk.yellowBright("\n📋 Summary:"));
      console.log(chalk.red(`   Critical Issues: ${analysis.issues.length}`));
      console.log(chalk.yellow(`   Warnings: ${analysis.warnings.length}`));
      console.log(chalk.cyan(`   Suggestions: ${analysis.suggestions.length}`));
      console.log(
        chalk.gray("\n   Fix critical issues before deploying to ensure security.\n")
      );
    }

    rl.close();
  } catch (err) {
    spinner.fail("❌ Analysis failed.");
    console.error(chalk.redBright(err.message));
    rl.close();
  }
}
