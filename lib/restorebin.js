const fs = require('fs-extra');
const path = require('path');

var binPath = path.join('.', 'bin.bak');
var bakPath = path.join('.', 'bin');
console.info(`Renaming '${binPath}' to '${bakPath}'.`);
fs.renameSync(binPath, bakPath);
