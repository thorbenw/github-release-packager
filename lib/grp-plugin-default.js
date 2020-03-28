/** @type {import('../index').GitHubReleasePlugin} */
exports.github = {
  /**
   * @type {import('../index').GitHubReleaseDownloadURLCallback}
   * A default implementation of
   * {@link import('../index').GithubReleaseDownloadURLCallback} which returns
   * the standard URL for release assets in GitHub.
   */
  downloadURL: async (repository, version) => {
    return `https://github.com/${repository.owner}/${repository.name}/archive/v${version}.zip`;
  },
  /**
   * @type {import('../index').GitHubReleaseProcessBinaryCallback}
   * A default implementation of
   * {@link import('../index').GitHubReleaseProcessBinaryCallback} which will
   * unzip the binary `file` to folder `folder`.
   */
  processBinary: async (file, folder) => {
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
   * @type {import('../index').GitHubReleaseBinariesCallback}
   * A default implementation of
   * {@link import('../index').GitHubReleaseBinariesCallback} which doesn't
   * return any niformation about binaries.
   */
  binaries: async (repository, version, folder) => {
    return {};
  }
};
