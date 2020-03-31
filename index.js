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
/** @typedef {string|number} SectionPart */

/** @typedef {SectionPart[]} VersionSection */

/** @typedef {object} Version
 * @property {VersionSection} Release The release part of a version.
 * @property {VersionSection} Prerelease The prerelease part of a version.
 * @property {VersionSection} BuildMetadata The build metadata part of a version.
 */

/**
 * @typedef {object} GitHubRepository
 * @property {string} owner
 * @property {string} name
 */

/**
 * @callback GitHubReleasePackagerDownloadURLCallback
 * @param {GitHubRepository} repository
 * @param {string} version
 * @param {GitHubReleasePackagerDefaultPlugin} defaultPlugin
 * @returns {Promise<string>}
 */

/**
 * @callback GitHubReleasePackagerSemverCallback
 * @param {string} version
 * @param {GitHubReleasePackagerDefaultPlugin} defaultPlugin
 * @returns {Promise<string>}
 */

/**
 * @callback GitHubReleasePackagerProcessBinaryCallback
 * @param {string} file
 * @param {string} folder
 * @param {GitHubReleasePackagerDefaultPlugin} defaultPlugin
 * @returns {Promise<void>}
 */

/**
 * @callback GitHubReleasePackagerExecutablesCallback
 * @param {GitHubRepository} repository
 * @param {string} version
 * @param {string} folder
 * @param {GitHubReleasePackagerDefaultPlugin} defaultPlugin
 * @returns {Promise<object>}
 */

/**
 * @callback GitHubReleasePackagerPostProcessCallback
 * @param {GitHubRepository} repository
 * @param {string} version
 * @param {string} folder
 * @param {object} executables
 * @param {GitHubReleasePackagerDefaultPlugin} defaultPlugin
 * @returns {Promise<object>}
 */

/**
 * @typedef {object} GitHubReleasePackagerPlugin
 * @property {string} Name
 * @property {GitHubReleasePackagerDownloadURLCallback} [getDownloadURL]
 * @property {GitHubReleasePackagerSemverCallback} [getSemver]
 * @property {GitHubReleasePackagerProcessBinaryCallback} [processBinary]
 * @property {GitHubReleasePackagerExecutablesCallback} [getExecutables]
 * @property {GitHubReleasePackagerPostProcessCallback} [postProcess]
 */

/**
 * @callback GitHubReleasePackagerParseVersionCallback
 * @param {string} version An arbitrate version specification.
 * @param {GitHubReleasePackagerDefaultPlugin} defaultPlugin
 * @returns {Promise<Version>} A promise of semver sections version, prerelease
 * and build metadata.
 */

/**
 * @callback GitHubReleasePackagerParseSectionCallback
 * @param {string} section An arbitrate section string.
 * @param {GitHubReleasePackagerDefaultPlugin} defaultPlugin
 * @returns {Promise<VersionSection>} A promise of an array of section parts,
 * each having either numeric or string type.
 */

/**
 * @callback GitHubReleasePackagerGetSectionStringCallback
 * @param {string} section An arbitrate section string.
 * @param {GitHubReleasePackagerDefaultPlugin} defaultPlugin
 * @returns {Promise<string>} A promise of valid section string, having all
 * invalid characters replaced with dots.
 */

/**
 * @callback GitHubReleasePackagerGetExecutableCallback
 * @param {string} executableName The label of the binary to fetch the full file
 * path and name for.
 * @param {object} executables An object containing executable information as
 * returned by {@link module:packager.GitHubReleasePackagerExecutablesCallback}.
 * @param {GitHubReleasePackagerDefaultPlugin} defaultPlugin
 * @returns {Promise<string>} `string`
 */

/**
 * @typedef {object} GitHubReleasePackagerExtendedPlugin
 * @property {GitHubReleasePackagerParseVersionCallback} ParseVersion
 * @property {GitHubReleasePackagerParseSectionCallback} ParseSection
 * @property {GitHubReleasePackagerGetSectionStringCallback} GetSectionString
 * @property {GitHubReleasePackagerGetExecutableCallback} GetExecutable
 */

/**
 * @typedef {GitHubReleasePackagerPlugin & GitHubReleasePackagerExtendedPlugin} GitHubReleasePackagerDefaultPlugin
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

// #region Variables
/** @type {GitHubReleasePackagerDefaultPlugin} */
var defaultPlugin;
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
  var defaultPlugin = exports.GetDefaultPlugin();

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
        console.info(`Plugin '${plugin.Name}' has been loaded successfully.`);
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

  if (!plugin.getSemver) {
    plugin.getSemver = defaultPlugin.getSemver;
  }

  if (!plugin.processBinary) {
    plugin.processBinary = defaultPlugin.processBinary;
  }

  if (!plugin.getExecutables) {
    plugin.getExecutables = defaultPlugin.getExecutables;
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

/**
 * Copies all path specifications found during traversing an object and converts
 * them to absolute or relative paths if needed.
 * @param {'absolute'|'relative'} pathKind The kind of path to convert all
 * copied paths to.
 * @param {string} rootPath The root folder to use as the 'from' path during
 * path kind conversions from absolute to relative or vice versa.
 * @param {object} object The object to traverse.
 * @returns {object} A copy of the input `object` containing the desired kind of
 * paths.
 */
function copyPaths (pathKind, rootPath, object) {
  if (typeof object !== 'object') {
    throw Error(`Parameter 'object' is not an object: [${object}]`);
  }

  var result = {};
  Object.keys(object).forEach(key => {
    var propertyValue = object[key];
    var propertyType = typeof propertyValue;
    switch (propertyType) {
      case 'string':
        switch (pathKind) {
          case 'absolute':
            if (!path.isAbsolute(propertyValue)) {
              result[key] = path.resolve(rootPath, propertyValue);
            }
            break;
          case 'relative':
            if (path.isAbsolute(propertyValue)) {
              result[key] = path.relative(rootPath, propertyValue).replace(/\\/g, '/');
            }
            break;
        }
        break;
      case 'object':
        result[key] = copyPaths(pathKind, rootPath, propertyValue);
        break;
      default:
        throw Error(`Type of property 'key' has unsupported type '${propertyType}'`);
    }
  });
  return result;
}
// #endregion

// #region Exports
/**
 * Returns a default plugin object. If a default plugin has already been loaded,
 * it won't be loaded again unless enforced.
 * @param {boolean} [force] Forces reloading the default plugin.
 * @returns {GitHubReleasePackagerDefaultPlugin} The default plugin instance.
 */
exports.GetDefaultPlugin = (force) => {
  if (!defaultPlugin || force === true) {
    var defaultPluginPath = path.join(path.dirname(__filename), 'lib', 'grp-plugin-default');
    console.debug(`Loading default plugin '${defaultPluginPath}'.`);
    defaultPlugin = require(defaultPluginPath).github;
    if (!defaultPlugin) {
      throw Error(`failed to load default plugin '${defaultPluginPath}'.`);
    } else {
      console.info(`Default plugin '${defaultPlugin.Name}' has been loaded successfully.`);
    }
  }

  return defaultPlugin;
};

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

  var uri = await plugin.getDownloadURL(repository, version, defaultPlugin);
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

    await fs.remove(path.dirname(binPath)).then(() => {
      fs.ensureDirSync(binPath);
    });

    await plugin.processBinary(tempFileName, binPath, defaultPlugin);

    cleanup();
  } else {
    console.debug('No downloads required.');
  }

  var updatePackageJson = false;

  var executables = await plugin.getExecutables(repository, version, binPath, defaultPlugin);
  if (typeof executables === 'object') {
    packageObject.packageJson.grp.executables = copyPaths('relative', path.dirname(packageObject.packageFileName), executables);
    updatePackageJson = true;
  } else {
    console.debug('No executables need to be updated. Skipping post processing.');
    return;
  }

  var bin = await plugin.postProcess(repository, version, binPath, executables, defaultPlugin);
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

    updatePackageJson = true;
  } else {
    console.debug('No binaries need to be updated.');
  }

  if (updatePackageJson) {
    fs.writeJSONSync(packageObject.packageFileName, packageObject.packageJson, { spaces: 2, encoding: 'utf8', EOL: os.EOL });
    console.debug(`Successfully updated package file '${packageObject.packageFileName}'.`);
  }
};

/**
 * Sync version of [UpdateBinary()]{@link module:packager~UpdateBinary} see
 * there for signature information.
 * @param {UpdateOptions=} options
 * @param {string=} version
 * @param {GitHubReleasePackagerPlugin=} plugin
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
  var plugin = getPlugin(null, packageObject);

  var latest = await this.GetLatestReleaseURL(repository.owner, repository.name).catch(err => {
    throw err;
  }).then(async url => {
    return url.split('/').pop();
  });

  var latestNPM = await plugin.getSemver(latest, defaultPlugin);
  if (semver.valid(latestNPM, { includePrerelease: true }) === null) {
    throw Error(`The plugin '${plugin.Name}' returned an invalid version expression '${latestNPM}'.`);
  }

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

  await this.UpdateBinary(options, latest, plugin);
};

/**
 * Sync version of [UpdatePackage()]{@link module:packager~UpdatePackage} see
 * there for signature information.
 * @param {UpdateOptions=} options
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
 * @param {string} owner
 * @param {string} repository
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
 * @param {string} executableName The label of the binary to fetch the full file
 * path and name for.
 * @param {UpdateOptions} [options] An {@link module:packager.UpdateOptions}
 * object.
 * @returns {Promise<string>} `string`
 */
exports.GetExecutable = async (executableName, options) => {
  options = options || {};

  var packageObject = getPackage(options);
  if (!packageObject.packageJson.grp) {
    return '';
  }

  if (!packageObject.packageJson.grp.executables) {
    return '';
  }

  var plugin = this.GetDefaultPlugin();
  return plugin.GetExecutable(executableName, copyPaths('absolute', path.dirname(packageObject.packageFileName), packageObject.packageJson.grp.executables), plugin);
};

/**
 * Sync version of [GetExecutable()]{@link module:packager~GetExecutable}
 * see there for signature information.
 * @param {string} executableName
 * @param {UpdateOptions} [options]
 * @returns {string} `string`
 */
exports.GetExecutableSync = (executableName, options) => {
  var result, err;
  exports.GetExecutable(executableName, options).then((executable) => {
    result = executable;
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
// #endregion
