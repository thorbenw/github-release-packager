/** @module packager */

const os = require('os');
const fs = require('fs-extra');
const path = require('path');
const request = require('then-request');
const download = require('request');
const semver = require('semver');
const callsites = require('callsites');
const deasync = require('deasync');

// #region Type Declarations
/**
 * @typedef {object} GitHubRepository
 * @property {string} owner
 * @property {string} name
 */

/**
 * @callback GitHubReleasePackagerDownloadURLCallback
 * @param {GitHubRepository} repository
 * @param {string} version
 * @returns {Promise<string>}
 */

/**
 * @callback GitHubReleasePackagerProcessBinaryCallback
 * @param {string} file
 * @param {string} folder
 * @returns {Promise<void>}
 */

/**
 * @callback GitHubReleasePackagerPostProcessCallback
 * @param {GitHubRepository} repository
 * @param {string} version
 * @param {string} folder
 * @returns {Promise<object>}
 */

/**
 * @typedef {object} GitHubReleasePackagerPlugin
 * @property {GitHubReleasePackagerDownloadURLCallback} [getDownloadURL]
 * @property {GitHubReleasePackagerProcessBinaryCallback} [processBinary]
 * @property {GitHubReleasePackagerPostProcessCallback} [postProcess]
 */

/**
 * @typedef {object} UpdateOptions
 * @property {UpdateOperation} [operation] The operation mode
 * (see {@link module:packager~UpdateOperation})
 * @property {string} [packagePath] The folder path to search for the package
 * file (defaults to the path of the first caller outside of the packager module
 * if omitted).
 * @property {string} [packageFile] The folder path to search for the package
 * file (defaults to `package.json` if omitted).
 */

/**
 * @typedef {object} Package
 * @property {object} packageJson
 * @property {string} packageFileName
 */

/**
 * Valid update operations.
 * @enum {number}
 */
exports.UpdateOperation = {
  /** Default operation, updating items as needed. */
  default: 0,
  /**
   * Check if updates are needed, but do not actually update anything.
   *
   * ---
   * Emits warnings, if an update is needed!
   */
  checkonly: 1,
  /** Update items, even if unnecessary. */
  force: 2
};
// #endregion

// #region Helpers
/**
 * @param {UpdateOptions} options An {@link module:packager.UpdateOptions}
 * object.
 * @returns {Package} The package JSON object along with the path from where it
 * has been loaded from.
 */
function getPackage (options) {
  options = options || {};

  if (isNaN(options.operation)) {
    options.operation = exports.UpdateOperation.default;
  }

  if (typeof options.packagePath !== 'string' || !options.packagePath) {
    var stack = callsites();
    for (let sidx = 0; sidx < stack.length; sidx++) {
      const frame = stack[sidx].getFileName();
      if (frame !== __filename) {
        options.packagePath = path.dirname(frame);
        break;
      }
    }
  }
  if (typeof options.packagePath !== 'string' || !options.packagePath) {
    console.warn(`Unable to find a caller outside of module 'packager' (${__filename}), falling back to current working directory.`);
    options.packagePath = '.';
  }
  if (!path.isAbsolute(options.packagePath)) {
    options.packagePath = path.resolve(options.packagePath);
  }

  if (typeof options.packageFile !== 'string' || !options.packageFile) {
    options.packageFile = 'package.json';
  }

  var packageFileName = path.resolve(options.packagePath, options.packageFile);
  if (!fs.existsSync(packageFileName)) {
    throw Error(`Package file '${packageFileName}' could not be found.`);
  }
  return { packageFileName: packageFileName, packageJson: fs.readJSONSync(packageFileName) };
}

/**
 * @param {GitHubReleasePackagerPlugin=} plugin A
 * {@link module:packager~GitHubReleasePackagerPlugin} object.
 * @param {Package} packageObject A
 * {@link module:packager.Package} object.
 * @returns {GitHubReleasePackagerPlugin} A
 * {@link module:packager~GitHubReleasePackagerPlugin} object.
 */
function getPlugin (plugin, packageObject) {
  var defaultPluginPath = path.join(path.dirname(__filename), 'lib', 'grp-plugin-default');
  /** @type {GitHubReleasePackagerPlugin} */
  var defaultPlugin = require(defaultPluginPath).github;
  if (!defaultPlugin) {
    throw Error(`failed to load default plugin '${defaultPluginPath}'.`);
  }

  if (!plugin) {
    var pluginName;
    if (packageObject.packageJson.grp) {
      pluginName = packageObject.packageJson.grp.plugin;
    }
    if (typeof pluginName === 'string' && pluginName.trim() !== '') {
      if (!path.isAbsolute(pluginName)) {
        pluginName = path.resolve(path.dirname(packageObject.packageFileName), pluginName);
      }

      console.debug(`Loading plugin module '${pluginName}'.`);
      var pluginModule = require(pluginName);
      if (pluginModule &&
          typeof pluginModule === 'object' &&
          pluginModule.hasOwnProperty('github') && // eslint-disable-line no-prototype-builtins
          typeof pluginModule.github === 'object') {
        plugin = pluginModule.github;
      } else {
        throw Error(`Plugin '${pluginName}' doesn't export a 'github' object.`);
      }
    } else {
      plugin = defaultPlugin;
    }
  }

  if (!plugin.getDownloadURL) {
    plugin.getDownloadURL = defaultPlugin.getDownloadURL;
  }

  if (!plugin.processBinary) {
    plugin.processBinary = defaultPlugin.processBinary;
  }

  if (!plugin.postProcess) {
    plugin.postProcess = defaultPlugin.postProcess;
  }

  return plugin;
}

/**
 * @param {Package} packageObject A
 * {@link module:packager.Package} object.
 * @returns {GitHubRepository} A
 * {@link module:packager~GitHubRepository} object.
 */
function getRepository (packageObject) {
  /** @type {GitHubRepository} */
  var result = {};

  var grp = packageObject.packageJson.grp;
  if (typeof grp !== 'object') {
    throw Error('There is no \'grp\' object specified in the package file.');
  }

  var repository = packageObject.packageJson.grp.repository;
  if (typeof repository !== 'string') {
    throw Error('There is no \'repository\' specified in the package file.');
  }

  var repositoryParts = repository.split(':', 2);
  if (repositoryParts.length < 2 || repositoryParts[0].toLowerCase() !== 'github') {
    throw Error(`repository '${repository}' is expected to be is short notation and to start with 'github'.`);
  }
  repositoryParts = repositoryParts[1].split('/', 2);
  if (repositoryParts.length < 2) {
    throw Error(`Invalid repository specification '${repository}'.`);
  }
  result.name = repositoryParts[1];
  result.owner = repositoryParts[0];

  return result;
}

/**
 * @param {boolean} condition The condition. If `true`, `trueText` will be
 * logged, otherwise `falseText` will be logged.
 * @param {UpdateOperation} operation The operation mode to consider.
 * @param {string} trueText The text to log if `condition` evaluates to `true`.
 * @param {string} falseText The text to log if `condition` evaluates to `false`.
 * @param {string} [detailText] A descriptive details text (defaults to a
 * standard text including the value of `condition`).
 */
function shouldAbort (condition, operation, trueText, falseText, detailText) {
  if (typeof detailText !== 'string' || detailText.trim() === '') {
    detailText = `'condition evaluates to [${condition}]`;
  }

  var msg;
  if (condition) {
    msg = `${trueText} (${detailText})`;
    if (operation === exports.UpdateOperation.force) {
      console.info(`${msg}, forcing update anyway.`);
    } else {
      console.info(`${msg}.`);
      return true;
    }
  } else {
    msg = `${falseText} (${detailText})`;
    if (operation !== exports.UpdateOperation.checkonly) {
      console.info(msg);
    } else {
      console.warn(msg);
      return true;
    }
  }

  return false;
}
// #endregion

// #region Exports
/**
 * Updates the binary files the consuming package wraps.
 * @param {UpdateOptions=} options An {@link module:packager.UpdatePackage}
 * object.
 * @param {string=} version The version to download.
 * @param {GitHubReleasePackagerPlugin=} plugin A
 * {@link module:packager.GitHubReleasePackagerPlugin} object.
 * @returns {Promise<void>} `Promise<void>`
 */
exports.UpdateBinary = async (options, version, plugin) => {
  options = options || {};

  var packageObject = getPackage(options);
  var repository = getRepository(packageObject);
  plugin = getPlugin(plugin, packageObject);

  if (!version) {
    version = await this.GetLatestReleaseURL(repository.owner, repository.name).catch(err => {
      throw err;
    }).then(async url => {
      return url.split('/').pop();
    });
  }

  var binPath = path.join(options.packagePath, 'bin', version);
  if (shouldAbort(fs.existsSync(binPath), options.operation, 'Binaries are up to date', 'Binaries need to be updated', `binary folder '${binPath}'`)) {
    return;
  }

  var uri = await plugin.getDownloadURL(repository, version);
  if (uri && typeof uri === 'string' && uri.trim() !== '') {
    var tempPath = fs.mkdtempSync(path.join(os.tmpdir(), `_temp_github-release-packager-${packageObject.packageJson.name}-`));
    var tempFile = uri.split('/').pop();
    var tempFileName = path.join(tempPath, tempFile);

    function cleanup () { // eslint-disable-line no-inner-declarations
      fs.removeSync(tempPath);
      console.debug(`Deleted temporary download folder '${tempPath}'.`);
    }

    console.debug(`Downloading '${uri}' ...`);
    // #region Download
    await new Promise((resolve, reject) => {
      download({
        uri: uri,
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          Connection: 'keep-alive',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8,ro;q=0.7,ru;q=0.6,la;q=0.5,pt;q=0.4,de;q=0.3',
          'Cache-Control': 'max-age=0',
          'Upgrade-Insecure-Requests': '1',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36'
        },
        gzip: true
      }).on('error', request => {
        reject(Error(`Request failed: ${request}`));
      }).on('response', response => {
        var statusText = `${response.statusCode} - ${response.statusMessage}`;
        switch (response.statusCode) {
          case 200:
            console.debug(statusText);
            response.pipe(fs.createWriteStream(tempFileName), {
              end: true
            }).on('error', (error) => {
              reject(error);
            }).on('finish', () => {
              console.debug(`Downloaded to '${tempFileName}'.`);
              resolve();
            });
            break;
          default:
            reject(Error(statusText));
            break;
        }
      });
    }).catch(err => {
      cleanup();
      throw err;
    });
    // #endregion

    if (!fs.existsSync(tempFileName)) {
      cleanup();
      throw Error('Download failed.');
    }

    fs.removeSync(path.dirname(binPath));
    fs.ensureDirSync(binPath);

    await plugin.processBinary(tempFileName, binPath);

    cleanup();
  } else {
    console.debug('No downloads required.');
  }

  var bin = await plugin.postProcess(repository, version, binPath);
  var keys = Object.keys(bin);
  if (keys.length > 0) {
    if (!packageObject.packageJson.bin) {
      packageObject.packageJson.bin = {};
    }

    keys.forEach(key => {
      var relPath = path.relative(path.dirname(packageObject.packageFileName), bin[key]).replace(/\\/g, '/');
      if (!path.isAbsolute(relPath)) {
        relPath = `./${relPath}`;
      }
      packageObject.packageJson.bin[key] = relPath;
    });

    fs.writeJSONSync(packageObject.packageFileName, packageObject.packageJson, { spaces: 2, encoding: 'utf8', EOL: os.EOL });
    console.debug(`Successfully updated binaries in package file '${packageObject.packageFileName}'.`);
  } else {
    console.debug('No binaries need to be updated.');
  }
};

/**
 * Sync version of [UpdateBinary()]{@link module:packager~UpdateBinary} see
 * there for signature information.
 * @param {UpdateOptions=} options An {@link module:packager.UpdatePackage}
 * object.
 * @param {string=} version The version to download.
 * @param {GitHubReleasePackagerPlugin=} plugin A
 * {@link module:packager.GitHubReleasePackagerPlugin} object.
 */
exports.UpdateBinarySync = (options, version, plugin) => {
  var err;
  var completed = false;
  exports.UpdateBinary(options, version, plugin).then(() => {
    completed = true;
  }).catch(reason => {
    completed = true;
    err = reason;
  });
  while (!completed) { // eslint-disable-line no-unmodified-loop-condition
    deasync.sleep(100);
  }
  if (err) {
    throw err;
  }
};

/**
 * @param {UpdateOptions=} options An {@link module:packager.UpdatePackage}
 * object.
 * @returns {Promise<void>} `Promise<void>`
 */
exports.UpdatePackage = async (options) => {
  options = options || {};

  var packageObject = getPackage(options);
  var repository = getRepository(packageObject);

  var latest = await this.GetLatestReleaseURL(repository.owner, repository.name).catch(err => {
    throw err;
  }).then(async url => {
    return url.split('/').pop();
  });

  var latestNPM = this.GetNPMVersion(latest);
  var needUpdate = semver.lt(packageObject.packageJson.version, latestNPM);

  if (shouldAbort(!needUpdate, options.operation, 'Package is up to date', 'Package needs update', `current version is [${packageObject.packageJson.version}], latest version is [${latestNPM}]`)) {
    return;
  }

  packageObject.packageJson.version = latestNPM;

  var relLibPath = path.relative(path.dirname(packageObject.packageFileName), path.join(__dirname, 'lib'));
  var relLibHidePath = path.join(relLibPath, 'renamebin').replace(/\\/g, '/');
  var relLibShowPath = path.join(relLibPath, 'restorebin').replace(/\\/g, '/');
  packageObject.packageJson.scripts = packageObject.packageJson.scripts || {};
  if (typeof packageObject.packageJson.scripts.prepack !== 'string' || packageObject.packageJson.scripts.prepack.indexOf(relLibHidePath) < 0) {
    if (typeof packageObject.packageJson.scripts.prepack === 'string' && typeof packageObject.packageJson.scripts.prepack_bak_grp !== 'string') {
      console.info(`Backing up property '${packageObject.packageFileName}/scripts.prepack' in '${packageObject.packageFileName}/scripts.prepack_bak_grp'.`);
      packageObject.packageJson.scripts.prepack_bak_grp = packageObject.packageJson.scripts.prepack;
    }
    console.info(`Adjusting property '${packageObject.packageFileName}/scripts.prepack' to '${relLibHidePath}'.`);
    packageObject.packageJson.scripts.prepack = `node "${relLibHidePath}"`;
  } else {
    console.debug(`Property '${packageObject.packageFileName}/scripts.prepack' already contains '${relLibHidePath}'.`);
  }
  if (typeof packageObject.packageJson.scripts.postpack !== 'string' || packageObject.packageJson.scripts.postpack.indexOf(relLibShowPath) < 0) {
    if (typeof packageObject.packageJson.scripts.postpack === 'string' && typeof packageObject.packageJson.scripts.postpack_bak_grp !== 'string') {
      console.info(`Backing up property '${packageObject.packageFileName}/scripts.postpack' in '${packageObject.packageFileName}/scripts.postpack_bak_grp'.`);
      packageObject.packageJson.scripts.postpack_bak_grp = packageObject.packageJson.scripts.postpack;
    }
    console.info(`Adjusting property '${packageObject.packageFileName}/scripts.postpack' to '${relLibShowPath}'.`);
    packageObject.packageJson.scripts.postpack = `node "${relLibShowPath}"`;
  } else {
    console.debug(`Property '${packageObject.packageFileName}/scripts.postpack' already contains '${relLibShowPath}'.`);
  }

  var npmIgnoreFile = path.join(path.dirname(packageObject.packageFileName), '.npmignore');
  if (!fs.existsSync(npmIgnoreFile)) {
    console.debug(`Creating npm ignore file '${npmIgnoreFile}'.`);
    fs.createFileSync(npmIgnoreFile);
  }
  var npmIgnore = [];
  fs.readFileSync(npmIgnoreFile, { encoding: 'utf8' }).split('\n').forEach(line => {
    var result = line.trim();
    if (result) {
      npmIgnore.push(result);
    }
  });
  if (!npmIgnore.includes('bin.bak')) {
    console.debug(`Updating npm ignore file '${npmIgnoreFile}'.`);
    npmIgnore.push(`bin.bak${os.EOL}`);
    fs.writeFileSync(npmIgnoreFile, npmIgnore.join(os.EOL), { encoding: 'utf8' });
  }

  fs.writeJSONSync(packageObject.packageFileName, packageObject.packageJson, { spaces: 2, encoding: 'utf8', EOL: os.EOL });
  console.info(`Successfully updated version in package file '${packageObject.packageFileName}'.`);

  await this.UpdateBinary(options, latest);
};

/**
 * Sync version of [UpdatePackage()]{@link module:packager~UpdatePackage} see
 * there for signature information.
 * @param {UpdateOptions=} options An {@link module:packager.UpdatePackage}
 * object.
 */
exports.UpdatePackageSync = (options) => {
  var err;
  var completed = false;
  exports.UpdatePackage(options).then(() => {
    completed = true;
  }).catch(reason => {
    completed = true;
    err = reason;
  });
  while (!completed) { // eslint-disable-line no-unmodified-loop-condition
    deasync.sleep(100);
  }
  if (err) {
    throw err;
  }
};

/**
 * @param {string} owner The GitHub account hosting the repository.
 * @param {string} repository The repository name.
 * @returns {Promise<string>} The URI of the latest release.
 */
exports.GetLatestReleaseURL = async (owner, repository) => {
  var result = '';
  var uri = `https://github.com/${owner}/${repository}/releases/latest`;

  await request.default('GET', uri).catch(err => {
    if (err) {
      if (err instanceof Error) {
        throw err;
      } else {
        throw Error(err);
      }
    }
  }).then(res => {
    /** @type {string} */
    var url;
    // @ts-ignore
    url = res.url;

    if (url === uri) {
      throw Error(`The requested repository '${repository}' from owner '${owner}' could not be found.`);
    }

    result = url;
  });

  return result;
};

/**
 * Sync version of [GetLatestReleaseURL()]{@link module:packager~GetLatestReleaseURL}
 * see there for signature information.
 * @param {string} owner The GitHub account hosting the repository.
 * @param {string} repository The repository name.
 * @returns {string} `string`
 */
exports.GetLatestReleaseURLSync = (owner, repository) => {
  var result, err;
  exports.GetLatestReleaseURL(owner, repository).then((url) => {
    result = url;
  }).catch(reason => {
    result = '';
    err = reason;
  });
  while (result === undefined) { // eslint-disable-line no-unmodified-loop-condition
    deasync.sleep(100);
  }
  if (err) {
    throw err;
  } else {
    return result;
  }
};

/**
 * @param {string} version A version string in arbitrate, but nevertheless
 * dotted, format.
 * @param {number=} overlapFactor The factor to multiply all version digits
 * beyond the 3rd digit with (defaults to 1000 if omitted).
 * @returns {string} An npm compatible (i.e. three digit plus patch) version
 * expression.
 */
exports.GetNPMVersion = (version, overlapFactor) => {
  if (!overlapFactor || typeof overlapFactor !== 'number') {
    overlapFactor = 1000;
  }

  if (typeof version !== 'string') {
    throw Error(`Parameter 'version' (${version}) is not a string.`);
  }

  var versionParts = [];
  version.split('.').forEach(digit => {
    var versionPart = parseInt(digit);
    if (isNaN(versionPart)) {
      versionParts.push(digit);
    } else {
      versionParts.push(versionPart);
    }
  });
  if (versionParts.length > 3) {
    version = `${versionParts[0]}.${versionParts[1]}.`;
    for (let index = 2; index < versionParts.length; index++) {
      if (typeof versionParts[index] === 'number') {
        version += `${versionParts[index] * overlapFactor}`;
      } else {
        version += versionParts[index];
      }
    }
  }

  return version;
};

/**
 * @param {string} binname The name of the binary to get the executable path
 * for.
 * @param {UpdateOptions} [options] An {@link module:packager.UpdateOptions}
 * object.
 * @returns {string} `string`
 */
exports.GetExecutable = (binname, options) => {
  options = options || {};

  var packageObject = getPackage(options);
  if (!packageObject.packageJson.bin) {
    return '';
  }

  var binPath = packageObject.packageJson.bin[binname] || '';
  if (binPath && binPath.trim() !== '' && !path.isAbsolute(binPath)) {
    binPath = path.resolve(path.dirname(packageObject.packageFileName), binPath);
  }
  return binPath;
};
// #endregion
