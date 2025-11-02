import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import AutoFixEngine from "./autoFixEngine.js";

/**
 * Chat-based Developer Assistant
 * Provides project-aware answers using AI + context from logs and project structure
 */
class ChatAssistant {
  constructor(cwd) {
    this.cwd = cwd;
    this.projectContext = null;
    this.buildLogs = [];
    this.recentBuildErrors = [];
    this.errorAnalysis = null;
  }

  /**
   * Gather project context
   */
  gatherContext() {
    if (this.projectContext) return this.projectContext;

    const context = {
      projectType: null,
      framework: null,
      dependencies: {},
      scripts: {},
      config: null,
      buildDir: null,
      deployDir: null,
      hasRouting: false,
      routingType: null,
      issues: [],
      recentErrors: [],
    };

    // Read package.json
    const packageJsonPath = path.join(this.cwd, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        context.dependencies = {
          ...(packageJson.dependencies || {}),
          ...(packageJson.devDependencies || {}),
        };
        context.scripts = packageJson.scripts || {};
        context.name = packageJson.name;
        context.version = packageJson.version;

        // Detect framework
        if (context.dependencies["react-scripts"]) {
          context.projectType = "react";
          context.framework = "Create React App";
          context.buildDir = "build";
        } else if (context.dependencies["next"]) {
          context.projectType = "nextjs";
          context.framework = "Next.js";
          context.buildDir = "out";
        } else if (context.dependencies["vite"]) {
          context.projectType = "vite";
          context.framework = "Vite";
          context.buildDir = "dist";
        } else if (context.dependencies["vue"] || context.dependencies["@vue/cli-service"]) {
          context.projectType = "vue";
          context.framework = "Vue.js";
          context.buildDir = "dist";
        } else if (context.dependencies["@angular/core"]) {
          context.projectType = "angular";
          context.framework = "Angular";
          context.buildDir = "dist";
        }

        // Check for routing
        if (context.dependencies["react-router-dom"] || context.dependencies["react-router"]) {
          context.hasRouting = true;
          context.routingType = "react-router";
        } else if (context.dependencies["next"]) {
          context.hasRouting = true;
          context.routingType = "next-router";
        } else if (context.dependencies["vue-router"]) {
          context.hasRouting = true;
          context.routingType = "vue-router";
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Read deployease config
    const deployeaseConfigPath = path.join(this.cwd, ".deployease.json");
    if (fs.existsSync(deployeaseConfigPath)) {
      try {
        context.config = JSON.parse(fs.readFileSync(deployeaseConfigPath, "utf-8"));
        context.deployDir = context.config.deployDir || context.buildDir || "dist";
        context.repo = context.config.repo;
        context.owner = context.config.owner;
      } catch (e) {
        // Ignore
      }
    }

    // Check for build directory
    const possibleBuildDirs = ["build", "dist", "out"];
    for (const dir of possibleBuildDirs) {
      if (fs.existsSync(path.join(this.cwd, dir))) {
        context.buildDir = dir;
        break;
      }
    }

    // Check for routing configuration files
    if (fs.existsSync(path.join(this.cwd, "src", "App.js")) || 
        fs.existsSync(path.join(this.cwd, "src", "App.jsx"))) {
      try {
        const appContent = fs.existsSync(path.join(this.cwd, "src", "App.jsx"))
          ? fs.readFileSync(path.join(this.cwd, "src", "App.jsx"), "utf-8")
          : fs.readFileSync(path.join(this.cwd, "src", "App.js"), "utf-8");
        
        if (appContent.includes("BrowserRouter") || appContent.includes("Route")) {
          context.hasRouting = true;
          context.routingType = "react-router";
        }
      } catch (e) {
        // Ignore
      }
    }

    // Check for recent error logs
    this.loadRecentErrors(context);

    // Try to analyze any stored build errors
    this.analyzeStoredBuildErrors(context);

    this.projectContext = context;
    return context;
  }

  /**
   * Analyze stored build errors using AutoFixEngine
   */
  analyzeStoredBuildErrors(context) {
    if (this.recentBuildErrors.length === 0) {
      // Try to load from a stored error log file
      const errorLogPath = path.join(this.cwd, ".deployease-build-error.log");
      if (fs.existsSync(errorLogPath)) {
        try {
          const errorContent = fs.readFileSync(errorLogPath, "utf-8");
          if (errorContent && errorContent.length > 0) {
            const projectInfo = {
              type: context.projectType || "unknown",
              buildCmd: context.scripts?.build || "npm run build",
            };
            
            const autoFix = new AutoFixEngine(this.cwd, projectInfo);
            const mockError = { message: errorContent.substring(0, 200) };
            this.errorAnalysis = autoFix.analyzeError(mockError, errorContent);
            
            // Store issues in context
            context.analyzedIssues = this.errorAnalysis.issues;
            context.suggestedFixes = this.errorAnalysis.suggestedFixes;
          }
        } catch (e) {
          // Ignore
        }
      }
    } else if (this.recentBuildErrors.length > 0) {
      // Analyze stored errors
      const errorText = this.recentBuildErrors.join("\n");
      const projectInfo = {
        type: context.projectType || "unknown",
        buildCmd: context.scripts?.build || "npm run build",
      };
      
      const autoFix = new AutoFixEngine(this.cwd, projectInfo);
      const mockError = { message: errorText.substring(0, 200) };
      this.errorAnalysis = autoFix.analyzeError(mockError, errorText);
      
      context.analyzedIssues = this.errorAnalysis.issues;
      context.suggestedFixes = this.errorAnalysis.suggestedFixes;
    }
  }

  /**
   * Load recent error logs from common log locations
   */
  loadRecentErrors(context) {
    const logFiles = [
      "npm-debug.log",
      "yarn-error.log",
      ".deployease-error.log",
    ];

    logFiles.forEach((logFile) => {
      const logPath = path.join(this.cwd, logFile);
      if (fs.existsSync(logPath)) {
        try {
          const content = fs.readFileSync(logPath, "utf-8");
          const lines = content.split("\n").slice(-50); // Last 50 lines
          context.recentErrors.push(...lines.filter((line) => 
            /error|Error|ERROR|fail|Fail|FAIL/i.test(line)
          ));
        } catch (e) {
          // Ignore
        }
      }
    });
  }

  /**
   * Answer a question based on project context
   */
  async answerQuestion(question) {
    const context = this.gatherContext();
    const questionLower = question.toLowerCase();

    // Question: Why did my build fail?
    if (questionLower.includes("build fail") || questionLower.includes("why did") && questionLower.includes("fail")) {
      return this.answerBuildFailure(context);
    }

    // Question: What's the issue with my routing?
    if (questionLower.includes("routing") || questionLower.includes("route") && questionLower.includes("issue")) {
      return this.answerRoutingIssue(context);
    }

    // Question: How do I fix the 404 after deployment?
    if (questionLower.includes("404") || (questionLower.includes("not found") && questionLower.includes("deploy"))) {
      return this.answer404Issue(context);
    }

    // Question: Build errors
    if (questionLower.includes("build error") || questionLower.includes("build issue")) {
      return this.answerBuildError(context);
    }

    // Question: Deployment issues
    if (questionLower.includes("deploy") && (questionLower.includes("issue") || questionLower.includes("problem"))) {
      return this.answerDeploymentIssue(context);
    }

    // Question: Missing dependencies
    if (questionLower.includes("missing") || questionLower.includes("module not found") || questionLower.includes("cannot find")) {
      return this.answerMissingDependency(context);
    }

    // Generic response
    return this.generateGenericResponse(question, context);
  }

  /**
   * Answer build failure questions
   */
  answerBuildFailure(context) {
    let answer = `🔍 **Build Failure Analysis**\n\n`;

    // Use analyzed errors from AutoFixEngine if available
    if (context.analyzedIssues && context.analyzedIssues.length > 0) {
      answer += `**Detected Issues:**\n\n`;
      context.analyzedIssues.forEach((issue, idx) => {
        answer += `${idx + 1}. **${issue.message}**\n`;
        if (issue.package) {
          answer += `   Package: \`${issue.package}\`\n`;
        }
        answer += `   Severity: ${issue.severity}\n\n`;
      });

      if (context.suggestedFixes && context.suggestedFixes.length > 0) {
        answer += `**Suggested Fixes:**\n\n`;
        context.suggestedFixes.forEach((fix, idx) => {
          const autoFixBadge = fix.autoFixable ? "✅ [Auto-fixable]" : "⚠️  [Manual]";
          answer += `${idx + 1}. ${fix.description} ${autoFixBadge}\n`;
          answer += `   Command: \`${fix.action}\`\n\n`;
        });
      }
      answer += `\n`;
    }

    // Check recent errors
    if (context.recentErrors.length > 0) {
      answer += `**Recent Error Logs:**\n\n`;
      
      const errorSummary = context.recentErrors.slice(0, 5).map((err, idx) => {
        let summary = `${idx + 1}. `;
        if (/cannot find module|module not found/i.test(err)) {
          const moduleMatch = err.match(/Cannot find module ['"]([^'"]+)['"]|Module not found: Can't resolve ['"]([^'"]+)['"]/i);
          const moduleName = moduleMatch ? (moduleMatch[1] || moduleMatch[2]) : "unknown";
          summary += `Missing module: \`${moduleName}\``;
        } else if (/syntax error|parse error/i.test(err)) {
          summary += "Syntax/parse error detected";
        } else if (/out of memory|heap/i.test(err)) {
          summary += "JavaScript heap out of memory";
        } else if (/permission denied|EACCES/i.test(err)) {
          summary += "Permission denied error";
        } else {
          summary += err.substring(0, 80) + (err.length > 80 ? "..." : "");
        }
        return summary;
      }).filter(Boolean);

      if (errorSummary.length > 0) {
        errorSummary.forEach(line => {
          answer += `   ${line}\n`;
        });
        answer += `\n`;
      }
    }

    // Check for common issues (only if not already analyzed)
    if (!context.analyzedIssues || context.analyzedIssues.length === 0) {
      answer += `**Common Build Issues:**\n\n`;

      // Missing dependencies
      if (context.projectType === "react" && !context.dependencies["react-scripts"]) {
        answer += `• **Missing react-scripts**: Your React app needs react-scripts installed.\n`;
        answer += `  Fix: Run \`npm install react-scripts\`\n\n`;
      }

      // Missing build script
      if (!context.scripts.build) {
        answer += `• **Missing build script**: Your package.json doesn't have a build script.\n`;
        if (context.projectType === "react") {
          answer += `  Fix: Add \`"build": "react-scripts build"\` to your scripts in package.json\n\n`;
        } else if (context.projectType === "vite") {
          answer += `  Fix: Add \`"build": "vite build"\` to your scripts in package.json\n\n`;
        }
      }

      // Missing node_modules
      if (!fs.existsSync(path.join(this.cwd, "node_modules"))) {
        answer += `• **Missing dependencies**: node_modules directory not found.\n`;
        answer += `  Fix: Run \`npm install\` to install all dependencies\n\n`;
      }

      // Syntax errors
      answer += `• **Check for syntax errors**: Look for red error messages in your build output.\n`;
      answer += `  Common causes: missing semicolons, unmatched brackets, or typos\n\n`;
    }

    answer += `**Quick Fix Steps:**\n`;
    answer += `1. Run \`npm install\` to ensure all dependencies are installed\n`;
    answer += `2. Clear cache: \`npm cache clean --force\`\n`;
    answer += `3. Delete node_modules and package-lock.json, then run \`npm install\` again\n`;
    answer += `4. Check your build script: \`npm run build\` should work locally first\n`;
    answer += `5. **Use \`deployease deploy\`** - it has AI auto-fix capabilities that can automatically detect and fix many issues!\n`;
    
    if (context.suggestedFixes && context.suggestedFixes.some(f => f.autoFixable)) {
      answer += `\n💡 **Pro Tip**: The auto-fix engine can automatically apply ${context.suggestedFixes.filter(f => f.autoFixable).length} fix(es) if you run \`deployease deploy\`\n`;
    }

    return answer;
  }

  /**
   * Answer routing issues
   */
  answerRoutingIssue(context) {
    let answer = `🔍 **Routing Issue Analysis**\n\n`;

    if (!context.hasRouting) {
      answer += `Your project doesn't seem to have routing configured.\n\n`;
      
      if (context.projectType === "react") {
        answer += `**To add routing to React:**\n`;
        answer += `1. Install: \`npm install react-router-dom\`\n`;
        answer += `2. Wrap your app with BrowserRouter in index.js\n`;
        answer += `3. Add Routes and Route components in App.js\n\n`;
      } else if (context.projectType === "nextjs") {
        answer += `Next.js has built-in file-based routing. Create pages in the \`pages\` directory.\n\n`;
      }
      return answer;
    }

    answer += `Your project uses **${context.routingType}** for routing.\n\n`;

    // Check for common routing issues
    if (context.routingType === "react-router" && context.config) {
      answer += `**Common React Router Issues on GitHub Pages:**\n\n`;
      
      answer += `• **404 errors on refresh**: GitHub Pages doesn't support client-side routing by default.\n`;
      answer += `  Fix: Use HashRouter instead of BrowserRouter:\n`;
      answer += `  \`\`\`js\n`;
      answer += `  import { HashRouter } from 'react-router-dom';\n`;
      answer += `  // Replace BrowserRouter with HashRouter\n`;
      answer += `  \`\`\`\n\n`;

      answer += `• **Base path issues**: If your repo name isn't the root, add a basename:\n`;
      answer += `  \`\`\`js\n`;
      answer += `  <BrowserRouter basename="/${context.repo || "your-repo"}">\n`;
      answer += `  \`\`\`\n\n`;

      answer += `• **Missing homepage in package.json**: Add homepage field:\n`;
      answer += `  \`\`\`json\n`;
      answer += `  "homepage": "https://${context.owner || "username"}.github.io/${context.repo || "repo"}/"\n`;
      answer += `  \`\`\`\n\n`;
    }

    // Check for routing config files
    const routingFiles = [
      path.join(this.cwd, "src", "App.js"),
      path.join(this.cwd, "src", "App.jsx"),
      path.join(this.cwd, "src", "index.js"),
    ];

    let foundRoutingFile = false;
    for (const file of routingFiles) {
      if (fs.existsSync(file)) {
        try {
          const content = fs.readFileSync(file, "utf-8");
          if (content.includes("BrowserRouter") && !content.includes("HashRouter")) {
            answer += `⚠️  **Issue Found**: You're using BrowserRouter, which may cause 404 errors on GitHub Pages.\n`;
            answer += `   Consider switching to HashRouter for better compatibility.\n\n`;
            foundRoutingFile = true;
            break;
          }
        } catch (e) {
          // Ignore
        }
      }
    }

    if (!foundRoutingFile) {
      answer += `**Troubleshooting Steps:**\n`;
      answer += `1. Check your routing configuration in App.js or index.js\n`;
      answer += `2. Verify all routes are properly defined\n`;
      answer += `3. Test routes locally before deploying\n`;
      answer += `4. For GitHub Pages, consider using HashRouter instead of BrowserRouter\n`;
    }

    return answer;
  }

  /**
   * Answer 404 issues after deployment
   */
  answer404Issue(context) {
    let answer = `🔍 **404 Error After Deployment - Solution**\n\n`;

    answer += `Getting 404 errors after deploying to GitHub Pages is very common. Here's why and how to fix it:\n\n`;

    answer += `**Root Causes:**\n\n`;

    // React Router with BrowserRouter
    if (context.routingType === "react-router") {
      answer += `1. **React Router BrowserRouter Issue**: \n`;
      answer += `   GitHub Pages serves files directly, but BrowserRouter expects server-side routing.\n`;
      answer += `   When you refresh a page like \`/about\`, GitHub Pages looks for \`/about/index.html\` which doesn't exist.\n\n`;
      
      answer += `   **Solution 1 - Use HashRouter (Recommended):**\n`;
      answer += `   \`\`\`js\n`;
      answer += `   // Replace BrowserRouter with HashRouter\n`;
      answer += `   import { HashRouter } from 'react-router-dom';\n`;
      answer += `   \n`;
      answer += `   <HashRouter>\n`;
      answer += `     <App />\n`;
      answer += `   </HashRouter>\n`;
      answer += `   \`\`\`\n`;
      answer += `   URLs will be like: \`https://username.github.io/repo/#/about\`\n\n`;

      answer += `   **Solution 2 - Add 404.html (Alternative):**\n`;
      answer += `   Copy your index.html to 404.html in the build directory:\n`;
      answer += `   \`\`\`bash\n`;
      answer += `   cp build/index.html build/404.html\n`;
      answer += `   \`\`\`\n\n`;
    }

    // Next.js routing
    if (context.projectType === "nextjs") {
      answer += `1. **Next.js Static Export**: \n`;
      answer += `   Make sure you're using static export for GitHub Pages.\n`;
      answer += `   Add to next.config.js:\n`;
      answer += `   \`\`\`js\n`;
      answer += `   module.exports = {\n`;
      answer += `     output: 'export',\n`;
      answer += `     trailingSlash: true,\n`;
      answer += `   }\n`;
      answer += `   \`\`\`\n\n`;
    }

    // Generic solutions
    answer += `2. **Missing index.html**: Ensure your build directory contains index.html\n`;
    answer += `   Current build directory: \`${context.buildDir || "Not detected"}\`\n\n`;

    answer += `3. **Incorrect base path**: If your repo name is part of the URL:\n`;
    if (context.config) {
      answer += `   Set homepage in package.json: \`https://${context.owner}.github.io/${context.repo}/\`\n\n`;
    } else {
      answer += `   Add homepage field to package.json with your GitHub Pages URL\n\n`;
    }

    answer += `**Quick Fix Checklist:**\n`;
    answer += `✓ Use HashRouter instead of BrowserRouter (for React apps)\n`;
    answer += `✓ Add homepage field to package.json\n`;
    answer += `✓ Verify index.html exists in build directory\n`;
    answer += `✓ Test your build locally: serve your build folder and test navigation\n`;
    answer += `✓ Clear browser cache after deployment\n`;

    return answer;
  }

  /**
   * Answer general build errors
   */
  answerBuildError(context) {
    let answer = `🔍 **Build Error Analysis**\n\n`;

    // If we have analyzed errors, use them
    if (context.analyzedIssues && context.analyzedIssues.length > 0) {
      answer += `**AI-Detected Issues:**\n\n`;
      context.analyzedIssues.forEach((issue, idx) => {
        answer += `${idx + 1}. **${issue.message}** (Severity: ${issue.severity})\n`;
        if (issue.package) {
          answer += `   Missing package: \`${issue.package}\`\n`;
        }
        answer += `\n`;
      });

      if (context.suggestedFixes && context.suggestedFixes.length > 0) {
        answer += `**Auto-Fix Suggestions:**\n\n`;
        context.suggestedFixes.forEach((fix, idx) => {
          answer += `${idx + 1}. ${fix.description}\n`;
          answer += `   Run: \`${fix.action}\`\n`;
          if (fix.autoFixable) {
            answer += `   ✅ This can be auto-fixed by \`deployease deploy\`\n`;
          }
          answer += `\n`;
        });
      }
      answer += `\n`;
    }

    if (context.recentErrors.length > 0) {
      answer += `**Recent Error Logs:**\n\n`;
      context.recentErrors.slice(0, 5).forEach((err, idx) => {
        const cleanErr = err.trim();
        if (cleanErr.length > 0) {
          answer += `${idx + 1}. ${cleanErr.substring(0, 120)}${cleanErr.length > 120 ? "..." : ""}\n`;
        }
      });
      answer += `\n`;
    }

    // Add general troubleshooting
    answer += this.answerBuildFailure(context);
    return answer;
  }

  /**
   * Answer deployment issues
   */
  answerDeploymentIssue(context) {
    let answer = `🔍 **Deployment Issue Analysis**\n\n`;

    if (!context.config) {
      answer += `No DeployEase configuration found. Run \`deployease init\` first.\n\n`;
      return answer;
    }

    answer += `**Your Deployment Config:**\n`;
    answer += `• Repository: ${context.owner}/${context.repo}\n`;
    answer += `• Branch: ${context.config.branch || "gh-pages"}\n`;
    answer += `• Deploy Directory: ${context.deployDir}\n\n`;

    // Check if deploy directory exists
    const deployDirPath = path.join(this.cwd, context.deployDir);
    if (!fs.existsSync(deployDirPath)) {
      answer += `⚠️  **Issue Found**: Deploy directory \`${context.deployDir}\` doesn't exist.\n`;
      answer += `   Fix: Run \`npm run build\` to create the build directory first.\n\n`;
    } else {
      const files = fs.readdirSync(deployDirPath);
      if (!files.includes("index.html")) {
        answer += `⚠️  **Issue Found**: No index.html in deploy directory.\n`;
        answer += `   GitHub Pages requires an index.html file.\n\n`;
      }
    }

    answer += `**Common Deployment Issues:**\n\n`;
    answer += `1. **Authentication**: Make sure you're logged in (\`deployease login\`)\n`;
    answer += `2. **Build first**: Ensure your project builds successfully before deploying\n`;
    answer += `3. **Check permissions**: Verify your GitHub token has repo permissions\n`;
    answer += `4. **Branch exists**: The gh-pages branch will be created automatically\n`;

    return answer;
  }

  /**
   * Answer missing dependency questions
   */
  answerMissingDependency(context) {
    let answer = `🔍 **Missing Dependency Analysis**\n\n`;

    answer += `**Common Solutions:**\n\n`;

    answer += `1. **Install all dependencies:**\n`;
    answer += `   \`npm install\`\n\n`;

    answer += `2. **Check package.json**: Verify the package is listed in dependencies or devDependencies\n\n`;

    answer += `3. **Clear and reinstall:**\n`;
    answer += `   \`\`\`bash\n`;
    answer += `   rm -rf node_modules package-lock.json\n`;
    answer += `   npm install\n`;
    answer += `   \`\`\`\n\n`;

    if (context.projectType === "react") {
      answer += `4. **React-specific**: Make sure react-scripts is installed:\n`;
      answer += `   \`npm install react-scripts\`\n\n`;
    }

    answer += `**Pro Tip**: Use \`deployease deploy\` - it has auto-fix that can install missing packages automatically!\n`;

    return answer;
  }

  /**
   * Generate generic response
   */
  generateGenericResponse(question, context) {
    let answer = `🤖 **Developer Assistant Response**\n\n`;

    answer += `I understand you're asking: "${question}"\n\n`;

    answer += `**Your Project Context:**\n`;
    answer += `• Type: ${context.projectType || "Unknown"}\n`;
    answer += `• Framework: ${context.framework || "None detected"}\n`;
    answer += `• Has Routing: ${context.hasRouting ? "Yes (" + context.routingType + ")" : "No"}\n\n`;

    answer += `**I can help with:**\n`;
    answer += `• "Why did my build fail?" - Analyze build errors\n`;
    answer += `• "What's the issue with my routing?" - Fix routing problems\n`;
    answer += `• "How do I fix the 404 after deployment?" - Solve 404 errors\n`;
    answer += `• Build errors, deployment issues, missing dependencies\n\n`;

    answer += `**Try asking more specific questions, or use:**\n`;
    answer += `• \`deployease deploy\` - Deploy with auto-fix capabilities\n`;
    answer += `• \`deployease check\` - Analyze your code for issues\n`;

    return answer;
  }
}

export default ChatAssistant;

