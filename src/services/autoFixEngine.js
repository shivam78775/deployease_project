import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import chalk from "chalk";

/**
 * AI Error Auto-Fix Engine
 * Analyzes build errors and automatically detects root causes,
 * suggests fixes, and optionally applies them.
 */
class AutoFixEngine {
  constructor(cwd, projectInfo) {
    this.cwd = cwd;
    this.projectInfo = projectInfo;
    this.fixes = [];
  }

  /**
   * Analyze build error and detect root cause
   * @param {Error} buildError - The build error object
   * @param {string} errorOutput - Full error output from stderr/stdout
   * @returns {Object} Analysis result with detected issues and fixes
   */
  analyzeError(buildError, errorOutput) {
    const errorText = errorOutput || buildError.message || "";
    const errorLower = errorText.toLowerCase();
    
    const issues = [];
    const suggestedFixes = [];

    // Pattern 1: Missing package/module
    if (
      /cannot find module|module not found|cannot resolve/i.test(errorText) ||
      /missing.*package/i.test(errorText) ||
      /react-scripts.*not found|react-scripts: command not found/i.test(errorText) ||
      /sh:.*react-scripts:.*not found/i.test(errorText)
    ) {
      const moduleMatch = errorText.match(
        /Cannot find module ['"]([^'"]+)['"]|Module not found: Can't resolve ['"]([^'"]+)['"]|react-scripts['"]? not found|sh: ([\w-]+): command not found|npm ERR! missing: ([\w-@/]+)/i
      );
      const missingPackage = moduleMatch 
        ? (moduleMatch[1] || moduleMatch[2] || moduleMatch[3] || moduleMatch[4] || 
           (errorText.match(/react-scripts/i) ? "react-scripts" : null))
        : null;
      
      issues.push({
        type: "missing_package",
        severity: "high",
        message: `Missing package or module: ${missingPackage || "unknown"}`,
        package: missingPackage,
      });

      if (missingPackage) {
        // Extract package name (remove scoped part if needed)
        const packageName = missingPackage.includes("/") 
          ? missingPackage.split("/")[0] + "/" + missingPackage.split("/")[1].split("'")[0]
          : missingPackage.split("'")[0].split('"')[0].trim();

        // Common package mappings
        const packageMappings = {
          "react-scripts": "react-scripts",
          "react/react": "react",
          "react-dom": "react-dom",
          "vite": "vite",
          "next": "next",
          "webpack": "webpack",
        };

        const actualPackage = packageMappings[packageName] || packageName;

        suggestedFixes.push({
          type: "install_package",
          description: `Install missing package: ${actualPackage}`,
          action: `npm install ${actualPackage}${this.isDevDependency(actualPackage) ? " --save-dev" : ""}`,
          autoFixable: true,
          package: actualPackage,
        });
      } else {
        suggestedFixes.push({
          type: "install_dependencies",
          description: "Install missing dependencies",
          action: "npm install",
          autoFixable: true,
        });
      }
    }

    // Pattern 2: Missing node_modules
    if (/ENOENT.*node_modules|Cannot find module.*node_modules/i.test(errorText)) {
      issues.push({
        type: "missing_node_modules",
        severity: "high",
        message: "node_modules directory not found or incomplete",
      });

      suggestedFixes.push({
        type: "install_dependencies",
        description: "Install all dependencies",
        action: "npm install",
        autoFixable: true,
      });
    }

    // Pattern 3: Build script not found
    if (/Missing script: "build"|npm ERR! missing script/i.test(errorText)) {
      issues.push({
        type: "missing_build_script",
        severity: "high",
        message: "Build script not found in package.json",
      });

      const packageJsonPath = path.join(this.cwd, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
          const deps = {
            ...(packageJson.dependencies || {}),
            ...(packageJson.devDependencies || {}),
          };

          if (deps["react-scripts"]) {
            suggestedFixes.push({
              type: "add_build_script",
              description: "Add build script for React app",
              action: "update_package_json",
              autoFixable: true,
              script: { build: "react-scripts build" },
            });
          } else if (deps["vite"]) {
            suggestedFixes.push({
              type: "add_build_script",
              description: "Add build script for Vite app",
              action: "update_package_json",
              autoFixable: true,
              script: { build: "vite build" },
            });
          }
        } catch (e) {
          // Ignore
        }
      }
    }

    // Pattern 4: Syntax errors
    if (/SyntaxError|ParseError|Unexpected token/i.test(errorText)) {
      const syntaxMatch = errorText.match(/SyntaxError[^\n]+|ParseError[^\n]+/);
      issues.push({
        type: "syntax_error",
        severity: "high",
        message: syntaxMatch ? syntaxMatch[0] : "Syntax error in source code",
      });

      suggestedFixes.push({
        type: "fix_syntax",
        description: "Fix syntax errors in source code",
        action: "manual_fix",
        autoFixable: false,
      });
    }

    // Pattern 5: TypeScript errors
    if (/Type error|TS\d+:/i.test(errorText)) {
      issues.push({
        type: "typescript_error",
        severity: "medium",
        message: "TypeScript compilation errors",
      });

      suggestedFixes.push({
        type: "fix_typescript",
        description: "Fix TypeScript errors",
        action: "manual_fix",
        autoFixable: false,
      });
    }

    // Pattern 6: Permission errors
    if (/EACCES|permission denied|EACCES/i.test(errorText)) {
      issues.push({
        type: "permission_error",
        severity: "high",
        message: "Permission denied error",
      });

      suggestedFixes.push({
        type: "fix_permissions",
        description: "Fix file permissions",
        action: "manual_fix",
        autoFixable: false,
      });
    }

    // Pattern 7: Out of memory
    if (/JavaScript heap out of memory|FATAL ERROR.*heap/i.test(errorText)) {
      issues.push({
        type: "memory_error",
        severity: "high",
        message: "JavaScript heap out of memory",
      });

      suggestedFixes.push({
        type: "increase_memory",
        description: "Increase Node.js memory limit",
        action: "NODE_OPTIONS=--max_old_space_size=4096 npm run build",
        autoFixable: true,
      });
    }

    // Pattern 8: Port already in use
    if (/EADDRINUSE|port.*already in use/i.test(errorText)) {
      issues.push({
        type: "port_in_use",
        severity: "medium",
        message: "Port already in use",
      });

      suggestedFixes.push({
        type: "change_port",
        description: "Change port or stop conflicting process",
        action: "manual_fix",
        autoFixable: false,
      });
    }

    return {
      issues,
      suggestedFixes,
      canAutoFix: suggestedFixes.some((fix) => fix.autoFixable),
    };
  }

  /**
   * Check if a package is typically a dev dependency
   */
  isDevDependency(packageName) {
    const devDeps = [
      "react-scripts",
      "vite",
      "webpack",
      "typescript",
      "@types",
      "eslint",
      "jest",
      "babel",
      "@vitejs",
    ];
    return devDeps.some((dep) => packageName.includes(dep));
  }

  /**
   * Apply a suggested fix
   * @param {Object} fix - The fix to apply
   * @returns {boolean} Success status
   */
  async applyFix(fix) {
    try {
      if (fix.type === "install_package" || fix.type === "install_dependencies") {
        console.log(chalk.cyan(`\n   📦 Installing: ${fix.action}...`));
        execSync(fix.action, {
          cwd: this.cwd,
          stdio: "inherit",
          shell: true,
        });
        console.log(chalk.green(`   ✅ Successfully installed dependencies\n`));
        return true;
      }

      if (fix.type === "add_build_script") {
        const packageJsonPath = path.join(this.cwd, "package.json");
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
          if (!packageJson.scripts) {
            packageJson.scripts = {};
          }
          packageJson.scripts = { ...packageJson.scripts, ...fix.script };
          fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
          console.log(chalk.green(`   ✅ Added build script to package.json\n`));
          return true;
        }
      }

      if (fix.type === "increase_memory") {
        // This will be handled by modifying the build command
        return true;
      }

      return false;
    } catch (error) {
      console.error(chalk.red(`   ❌ Failed to apply fix: ${error.message}`));
      return false;
    }
  }

  /**
   * Get user-friendly error summary
   */
  getErrorSummary(analysis) {
    if (analysis.issues.length === 0) {
      return "Unknown build error. Please check the error output above.";
    }

    const primaryIssue = analysis.issues[0];
    return primaryIssue.message;
  }
}

export default AutoFixEngine;

