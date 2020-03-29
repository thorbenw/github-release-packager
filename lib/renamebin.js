const fs = require('fs-extra');
const path = require('path');

var oldBinPath = path.join('.', 'bin');
var newBinPath = path.join('.', 'bin.bak');
console.info(`Renaming '${oldBinPath}' to '${newBinPath}'.`);
fs.renameSync(oldBinPath, newBinPath);
