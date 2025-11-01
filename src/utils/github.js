const { Octokit } = require('@octokit/rest');


function getOctokit(token) {
return new Octokit({ auth: token });
}


async function createRepo(token, name, isPrivate = false) {
const octo = getOctokit(token);
const res = await octo.repos.createForAuthenticatedUser({
name,
private: isPrivate,
});
return res.data;
}


async function checkRepoExists(token, owner, repo) {
const octo = getOctokit(token);
try {
const res = await octo.repos.get({ owner, repo });
return res.data;
} catch (err) {
if (err.status === 404) return null;
throw err;
}
}


async function enablePages(token, owner, repo, branch = 'gh-pages') {
const octo = getOctokit(token);
try {
const res = await octo.repos.createPagesSite({
owner,
repo,
source: { branch, path: '/' },
});
return res.data;
} catch (err) {
// fallback: some endpoints require different perms; ignore gracefully
return null;
}
}


module.exports = { getOctokit, createRepo, checkRepoExists, enablePages };