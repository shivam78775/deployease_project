const fs = require('fs-extra');
const path = require('path');


const DEPLOY_DIR = path.join(process.cwd(), '.deployease');
const CONFIG_PATH = path.join(DEPLOY_DIR, 'config.json');


function ensureDir() {
fs.ensureDirSync(DEPLOY_DIR);
}


function saveConfig(obj) {
ensureDir();
fs.writeJsonSync(CONFIG_PATH, obj, { spaces: 2 });
}


function getConfig() {
try {
return fs.readJsonSync(CONFIG_PATH);
} catch (err) {
return null;
}
}


function clearConfig() {
try {
fs.removeSync(DEPLOY_DIR);
} catch (err) {}
}


module.exports = {
saveConfig,
getConfig,
clearConfig,
CONFIG_PATH,
};