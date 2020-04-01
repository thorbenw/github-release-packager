const semver = require('semver');

/** @type {import('../index').GitHubReleasePackagerDefaultPlugin} */
exports.github = {
  Name: __filename,
  /**
   * @type {import('../index').GitHubReleasePackagerDownloadURLCallback}
   * A default implementation of
   * {@link import('../index').GithubReleasePackagerDownloadURLCallback} which
   * returns the standard URL for release assets in GitHub.
   */
  getDownloadURL: async (repository, version, defaultPlugin) => {
    return `https://github.com/${repository.owner}/${repository.name}/archive/v${version}.zip`;
  },
  /**
   * @type {import('../index').GitHubReleasePackagerSemverCallback}
   * A default implementation of
   * {@link import('../index').GitHubReleasePackagerSemverCallback} which
   * converts a dotted version expression to a valid semver expressions.
   */
  getSemver: async function (version, defaultPlugin) {
    if (typeof version !== 'string' || version.trim() === '') {
      throw Error(`Parameter 'version' (${version}) is not a string, or empty, or consists only of whitespace characters.`);
    }

    var result = semver.valid(version, { includePrerelease: true });
    if (result !== null) {
      return result;
    }

    /** @type {import('../index').Version} */
    var sections = await defaultPlugin.ParseVersion(version, defaultPlugin);

    var firstThreeVersionPartsAreDigits = true;
    for (let vIdx = 0; vIdx < Math.min(sections.Release.length, 3); vIdx++) {
      if (typeof sections.Release[vIdx] !== 'number') {
        firstThreeVersionPartsAreDigits = false;
        break;
      }
    }
    if (firstThreeVersionPartsAreDigits) {
      result = sections.Release.slice(0, Math.min(sections.Release.length, 3)).join('.');
      if (sections.Release.length < 3) {
        result += '.0';
      }
      if (sections.Release.length < 2) {
        result += '.0';
      }
      if (sections.Release.length > 3) {
        result += '-' + sections.Release.slice(3).join('.');
      }
    } else {
      result = '0.0.0';
      if (sections.Release.length > 0) {
        result += '-' + sections.Release.join('.');
      }
    }

    if (sections.Prerelease.length > 0) {
      result += '-' + sections.Prerelease.join('.');
    }

    if (sections.BuildMetadata.length > 0) {
      result += '+' + sections.BuildMetadata.join('.');
    }

    return result;
  },
  /**
   * @type {import('../index').GitHubReleasePackagerProcessBinaryCallback}
   * A default implementation of
   * {@link import('../index').GitHubReleasePackagerProcessBinaryCallback} which
   * will unzip the binary `file` to folder `folder`.
   */
  processBinary: async (file, folder, defaultPlugin) => {
    const fs = require('fs');
    const unzip = require('unzipper');

    console.debug(`Unzipping file '${file}' to folder '${folder}' ...`);
    await new Promise((resolve, reject) => {
      fs.createReadStream(file).pipe(unzip.Extract({ path: folder })).on('finish', () => {
        console.debug(`Successfully completed decompression of '${file}'.`);
      }).on('close', args => {
        console.debug(`Successfully completed writing to '${folder}'.`);
        resolve();
      }).on('error', err => {
        reject(err);
      });
    }).catch(err => {
      throw err;
    });
  },
  /**
   * @type {import('../index').GitHubReleasePackagerExecutablesCallback}
   * A default implementation of
   * {@link import('../index').GitHubReleasePackagerExecutablesCallback} which
   * doesn't return any information about executables.
   */
  getExecutables: async (repository, version, folder, defaultPlugin) => {
    return {};
  },
  /**
   * @type {import('../index').GitHubReleasePackagerPostProcessCallback}
   * A default implementation of
   * {@link import('../index').GitHubReleasePackagerPostProcessCallback} which
   * doesn't return any information about binaries.
   */
  postProcess: async (repository, version, folder, executables, defaultPlugin) => {
    return {};
  },
  /**
   * @type {import('../index').GitHubReleasePackagerParseVersionCallback}
   * A default implementation of
   * {@link import('../index').GitHubReleasePackagerParseVersionCallback} which
   * can turn any arbitrate text expression into a semver compatible version
   * expression without being able to guarantee correct precedence.
   * Splits an arbitrate version specification into its main parts, replaces all
   * invalid characters with dots, and inserts '0' between all consecutive dots.
   */
  ParseVersion: async function (version, defaultPlugin) {
    if (typeof version !== 'string') {
      throw Error(`Type of parameter 'version' (${version}) must be 'string'.`);
    }

    /** @type {import('../index').Version} */
    var result = {};

    var sections = version.split('-', 2);
    result.Release = await this.ParseSection(sections[0], defaultPlugin);

    if (sections.length > 1) {
      sections = sections[1].split('+', 2);
      result.Prerelease = await this.ParseSection(sections[0], defaultPlugin);
    } else {
      result.Prerelease = [];
    }

    if (sections.length > 1) {
      result.BuildMetadata = await this.ParseSection(sections[1], defaultPlugin);
    } else {
      result.BuildMetadata = [];
    }

    return result;
  },
  /**
   * @type {import('../index').GitHubReleasePackagerParseSectionCallback}
   * A default implementation of
   * {@link import('../index').GitHubReleasePackagerParseSectionCallback}
   */
  ParseSection: async function (section, defaultPlugin) {
    if (typeof section !== 'string') {
      throw Error(`Type of parameter 'section' (${section}) must be 'string'.`);
    }

    /** @type {import('../index').VersionSection} */
    var result = [];

    (await this.GetSectionString(section, defaultPlugin)).split('.').forEach((part, pIdx, pArr) => {
      if (part.trim() === '') {
        if (pIdx < (pArr.length - 1)) {
          result.push(0);
        }
      } else {
        var num = parseInt(part);
        if (!isNaN(num) && num >= 0) {
          result.push(num);
        } else {
          result.push(part);
        }
      }
    });

    return result;
  },
  /**
   * @type {import('../index').GitHubReleasePackagerGetSectionStringCallback}
   * A default implementation of
   * {@link import('../index').GitHubReleasePackagerGetSectionStringCallback}
   */
  GetSectionString: async function (section, defaultPlugin) {
    if (typeof section !== 'string') {
      throw Error(`Type of parameter 'section' (${section}) must be 'string'.`);
    }

    return section.replace(/[^0-9a-zA-Z-\.]/g, '.'); // eslint-disable-line no-useless-escape
  },
  /**
   * @type {import('../index').GitHubReleasePackagerGetExecutableCallback}
   * A default implementation of
   * {@link import('../index').GitHubReleasePackagerGetExecutableCallback}
   */
  GetExecutable: async function (executableName, executables, defaultPlugin) {
    var executablePath = executables[executableName];
    if (!executablePath) {
      return '';
    }

    executablePath = executablePath[process.platform] || executablePath.default;
    if (!executablePath) {
      return '';
    }

    executablePath = executablePath[process.arch] || executablePath.default;
    if (!executablePath) {
      return '';
    }

    return executablePath || '';
  }
};
