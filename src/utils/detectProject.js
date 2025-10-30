const fs = require('fs');
const path = require('path');


function detect() {
const pkgPath = path.join(process.cwd(), 'package.json');
if (fs.existsSync(pkgPath)) {
const pkg = require(pkgPath);
const scripts = pkg.scripts || {};
if (scripts.build) {
return { type: 'node', buildCmd: 'npm run build', buildDir: ['build', 'dist'] };
}
}
// fallback: look for index.html
if (fs.existsSync(path.join(process.cwd(), 'index.html'))) {
return { type: 'static', buildCmd: null, buildDir: ['.'] };
}
return { type: 'unknown', buildCmd: null, buildDir: ['build', 'dist'] };
}


module.exports = detect;