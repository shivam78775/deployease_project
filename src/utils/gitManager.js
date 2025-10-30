const simpleGit = require('simple-git');


async function initAndPushLocalRepo({ repoUrl, commitMessage = 'Initial commit' }) {
const git = simpleGit(process.cwd());
await git.init();
await git.add('./*');
await git.commit(commitMessage).catch(() => {}); // ignore if nothing to commit
await git.addRemote('origin', repoUrl).catch(() => {});
await git.push('origin', 'main').catch(async (err) => {
// if main doesn't exist remotely, create branch
await git.push(['-u', 'origin', 'main']);
});
}


module.exports = { initAndPushLocalRepo };