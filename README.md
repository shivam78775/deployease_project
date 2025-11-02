# 🚀 DeployEase

### *"Simplify Static Website Deployment — from code to live in one command."*

---

## 🏆 **Hackathon Submission**
**Event:** Hack with Uttar Pradesh 2025  
**Venue:** Chandigarh University, Lucknow Campus  
**Duration:** 1st – 2nd November 2025  
**Team Name:** Helios Hacker  
**Theame:** Open Innovation
**Project Category:** Developer Tools / CLI Automation  

---

## 👨‍💻 **Team Members**
**1. Ayan Ali**
**2. Shivam Singh Rathore**
**3. Karanpal Singh**
**4. Lalit Kumar**
**5. Akash Singh Shekhawat**

---

## 💡 **Project Overview**

**DeployEase** is an open-source **Command Line Interface (CLI) tool** designed to automate the **entire website deployment process**.  
With a single command, users can **initialize**, **deploy**, **redeploy**, and **manage** their web projects directly from the terminal.

The tool integrates **Git**, **GitHub Pages**, and **custom automation scripts**, enabling developers to deploy **static or frontend apps (HTML, React, Vue, etc.)** instantly — no manual setup required.

---

## 🎯 **Problem Statement**

Deploying websites manually involves:
- Creating a GitHub repository  
- Running multiple `git` commands  
- Configuring GitHub Pages  
- Managing access tokens and redeployments  

These steps are **time-consuming**, **error-prone**, and **frustrating for beginners** — especially during hackathons where **speed matters most**.

---

## 💡 **Solution**

**DeployEase** brings automation to deployment with **simple, human-readable commands** that handle everything from setup to redeployment.

Example:

```bash
deployease deploy
The command:

Creates a GitHub repo (if not exists)

Pushes project files

Configures GitHub Pages automatically

Returns your live site link instantly 🌍

⚙️ Tech Stack
Layer	Tools / Libraries	Purpose
Language	Node.js	Backend CLI development
CLI Framework	Commander	Handles commands like deploy, redeploy, etc.
Prompt System	Inquirer	Interactive terminal questions
Git Automation	Simple-Git	Automates git operations
Deployment	gh-pages	Publishes build folder to GitHub Pages
GitHub API	Octokit	Repo creation & management
Styling & UI	Chalk, Ora	Adds colors, spinners & feedback
Config Storage	dotenv, fs-extra	Handles tokens & project data

🧩 Main Features
Command	Description
deployease init	Initialize a new project configuration
deployease deploy	Deploy your project to GitHub Pages
deployease redeploy	Redeploy updated code automatically
deployease check	Verify project status & deployment link
deployease help	View all available commands and usage
deployease chat	Access DeployEase chat assistant (AI help)
deployease login	Login to your GitHub account securely
deployease logout	Logout and clear saved credentials
deployease readme	View project documentation directly in terminal

🧠 Core Concept
DeployEase = GitHub Automation + Simple CLI + Fast Deployment

It bridges the gap between developers and deployment, turning complex steps into simple, guided commands.

🔄 How It Works
Initialize Project

bash
Copy code
deployease init
Collects GitHub credentials

Saves configuration locally

Deploy Your Project

bash
Copy code
deployease deploy
Builds & pushes your project

Sets up GitHub Pages

Returns live URL

Redeploy Changes

bash
Copy code
deployease redeploy
Detects new commits and redeploys automatically

Check Deployment

bash
Copy code
deployease check
Verifies if deployment is live & returns link

⚙️ Configuration Example
json
Copy code
{
  "user": "shivamrathore",
  "repo": "my-portfolio",
  "branch": "main",
  "buildPath": "./dist",
  "pagesURL": "https://shivamrathore.github.io/my-portfolio"
}
⚔️ Comparison with Others
Feature	Manual GitHub Pages	DeployEase
Repo Creation	Manual	Automated
Git Commands	Required	Not Needed
Deployment Speed	Slow	Instant
Ease of Use	Intermediate	Beginner Friendly
Live Link Output	Manual	Automatic

🌟 Why DeployEase?
✅ One-command deployment
✅ Zero setup required
✅ Beginner-friendly
✅ Works with any static project
✅ Integrated AI chat helper for instant support

🚧 Future Enhancements
🌐 Support for Vercel, Netlify, and Render

🔒 Encrypted credential storage

🖥️ GUI Dashboard (Electron App)

💬 Built-in log viewer and analytics

🧭 What We Learned
CLI app development with Node.js

GitHub API and token handling

Automation scripting

Cross-platform deployment handling

🧑‍🏫 Demo Usage
bash
Copy code
# Initialize project
deployease init

# Deploy to GitHub Pages
deployease deploy

# Redeploy updated version
deployease redeploy

# Check deployment status
deployease check

💬 “DeployEase turns hours of setup into seconds of deployment — empowering developers to focus on innovation, not configuration.” ⚡

yaml
Copy code
