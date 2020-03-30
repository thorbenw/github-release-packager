GitHub Release Packager
=========================

Package releases of GitHub projects.

[![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg?style=flat-square)](https://github.com/standard/semistandard)
[![vscode-cspell-style](https://img.shields.io/badge/spell%20check-cSpell-brightgreen.svg?style=flat-square&logo=visual-studio-code)](https://github.com/streetsidesoftware/vscode-spell-checker)
[![github-release-packager-issues](https://img.shields.io/github/issues/thorbenw/github-release-packager)](https://github.com/thorbenw/github-release-packager)
[![github-release-packager-style](https://img.shields.io/node/v/github-release-packager)](https://github.com/thorbenw/github-release-packager)
[![github-release-packager-license](https://img.shields.io/npm/l/github-release-packager)](https://github.com/thorbenw/github-release-packager)
[![github-release-packager-version](https://img.shields.io/npm/v/github-release-packager)](https://github.com/thorbenw/github-release-packager)

Installation
------------
```bash
npm i github-release-packager
```

Why?
----
Because there wasn't any npm package to wrap [pandoc](https://pandoc.org/) for
use with JavaScript in node without requiring it to be installed locally and I
wasn't up to care about that, I just wanted to install an npm package and go
ahead.

<span style="color:red; font-size:150%">
The current status of this project is 'as needed to package `pandoc`'. Basic
things might still change, but I'm eager to provide according semantic
versioning to save anyone from getting into trouble due to breaking changes.
</span>

Usage
-----
Create a new npm package for the GitHub project you want to wrap and install the
packager as a regular dependency.
```bash
mkdir myPackage
cd myPackage
npm init -y
npm i github-release-packager
```
Then, add a new `grp` object to your package file (usually `package.json`),
supply a property `repository` and set it's value to the repository of the
GitHub project you want to package. The repository specification must be in
GitHub notation.
```json
{
  ...
  "grp": {
    "repository": "github:<owner>/<repository>"
  }
  ...
}
```
Finally, add a call to the `UpdatePackage()` function as an npm script, e.g. the
`build` script is a good place to put it.
```json
{
  ...
  "scripts": {
        "build": "node -e \"require('github-release-packager').UpdatePackage()\"",
  }
  ...
}
```
If you now issue `npm run build`, the specified repository will be queried for
the latest release version, the package file `version` property will be updated
with that version and the binaries will be downloaded and extracted to the `bin`
folder in your package folder.

### About the binaries folder
The exact folder the binaries will be put in is `bin/<version>` to keep track of
whether the binaries exist or if they still need to be downloaded. Each call of
`UpdateBinaries()` will entirely erase the `bin` folder, so don't put anything
there you want to keep.

If you check in your package to version control, add the `bin` folder to the
`.gitignore` file - they aren't required to be in source control because they'll
be fetched as needed.

When running `npm pack` or `npm publish`, the `bin` folder will be temporarily
renamed to `bin.bak`, and renamed back to `bin` afterwards.
>To accomplish this, the `prepack` and `postpack` scripts in `package.json` as
well as the `.npmignore` file are maintained automatically in each run of
`UpdatePackage()`. It turned out to be quite hard to exclude the `bin` folder
through having it in either `.gitignore`, `.npmignore` or both, I couldn't make
`npm` reliably exclude the whole `bin` folder - maybe because there were entries
in the `bin` object of `package.json` pointing to items below `bin`, or due to
some files having names that cannot be excluded ...

>However, npm doesn't complain if binaries pointed to in `package.json` are
actually missing during `pack` or `publish`. I wasn't able to find accurate info
on this topic, except what is available in the
[documentation of `package.json`](https://docs.npmjs.com/files/package.json),
but it seems to be somewhat outdated. Because in this case I'm the one who's
doing something 'odd', I didn't raise an issue about this but just went ahead
with the approach that worked.

#### So why are the binaries already fetched during package update?
To provide a way to do post processing (see below).

### About versions
The package version is automatically set to the same version as the wrapped
project.
If the wrapped project doesn't use versioning compatible to 
[Semantic Versioning 2.0.0](https://semver.org/) (which is necessary to use
in npm packages), it's version is converted accordingly.
The default conversion provided by the default plugin (see below) can convert
any arbitrate text into a valid version expression, it cannot guarantee
precedence will work as expected. If the target project is using a versioning
approach that can guarantee correct precedence processing, but isn't supported
by the default implementation (e.g. digit 'importance' in right-to-left order or
the like), you can implement a plugin that will handle the specific format.

### Plugins
In order to successfully download, extract and post process the binaries of a
GitHub project, you need the following:
- The correct download URLs
- Version translation
- The according decompressor(s)
- An opportunity to post process the whole package update

A default plugin exists that can provide all of the above-mentioned in a default
way, i.e. it will
- Provide the standard download URL which points to a `/archive/v<version>.zip`
file in the repository
- Convert each arbitrary text into a
[Semantic Versioning 2.0.0](https://semver.org/) compliant version expression
- Extract the downloaded file using a ZIP decompressor
- Do no post processing at all

If this fits the repository releases you want to package, you're ready to start,
otherwise you can implement your own plugin.

To do so, create a new JavaScript file and point to it in a `plugin` property
of the `grp` object in the package file (omit the `.js` file extension because
the file will be `require()`d by the packager).
```json
{
  ...
  "grp": {
    "repository": "github:<owner>/<repository>",
    "plugin": "./myPlugin"
  }
  ...
}
```
In the plugin JavaScript file, export a `github` object having one or more of
the following properties, all of which have to be `async function`s:
- `getDownloadURL(repository, version) => Promise<string>`
- `getSemver(version, defaultPlugin) => Promise<string>`
- `processBinary(file, folder) => Promise<void>`
- `postProcess(repository, version, folder) => Promise<object>`

Also add a property `Name` and set it to a string value identifying you plugin
(e.g. the file name of the plugin JavaScript file).

If your IDE supports it, place a JsDoc comment right above the `github` export
to help you implementing the plugin, as it exists in the following example.
```javascript
/** @type {import('github-release-packager').GitHubReleasePackagerPlugin} */
exports.github = {
  Name: __filename,
  getDownloadURL: async (repository, version) => {
    // return a URL for downloading the requested binaries version
    return `https://alias.domain.tld/${repository.owner}/${repository.name}/somespecialsubpath/customname-verionspec${version}.exoticextension`;
  },
  getSemver: async function (version, defaultPlugin) {
    /*
    Return a semver compliant version string. If needed, use the methods
    ParseVersion(), ParseSection() and GetSectionString() provided by the
    default plugin which is passed in as the defaultPlugin parameter, e.g.
    var versionObject = defaultPlugin.ParseVersion(version);
    return versionObject.Release.reverse().join('.');
    */
    return defaultPlugin.getSemver(version, defaultPlugin);
  },
  processBinary: async (file, folder) => {
    /*
    Do anything required to extract everything from 'file' to 'folder'.
    If an exotic compression algorithm is used, seize the opportunity to
    get a package that can handle it.
    The 'file' resides in a temporary folder which will be deleted automatically
    after this function is left.
    The 'folder' is the version specific folder below 'bin' (see above), but
    of course you can put the binaries elsewhere, as needed. Just leave the
    folder intact to indicate the binaries have been downloaded!
    */
  },
  postProcess: async (repository, version, folder) => {
    /*
    Do whatever you need or want, e.g. query files in 'folder' to add or apply
    changes to your code, provide/generate definitions files, etc.
    Optionally return an object containing information about what you'd like to
    have in the `bin` object of the package file. If you do so, the object will
    be merged with an existing object in the package file (no plain overwrite).
    The paths you return must fulfill the requirements of `package.json` (if
    any exist).
    */
    
    return {
      command_of_choice: "./bin/<version>/executable"
    }
  }
}
```

Wrapping
--------
Once your package updates are working as expected, you can start implementing
the wrapper itself.

Once the wrapper is working as desired, you can implement continuous deployment
by e.g. setting up a scheduled GitHub Actions Workflow that checks whether an
updated release version is available (by simply running 'npm run build'), and if
so, commit and publish the new build.

ToDos
-----
- Nothing important
