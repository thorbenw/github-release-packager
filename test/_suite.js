const os = require('os');
const path = require('path');
const assert = require('assert');
const grp = require('../index');
// @ts-ignore
const thisPackage = require('../package.json');

console.log(`${os.EOL}Running Mocha Test Suite ...`);

describe(`${thisPackage.name} Default Plugin tests`, function () {
  /** @type {import('../index').GitHubReleasePackagerDefaultPlugin} */
  var plugin = grp.GetDefaultPlugin(true);

  it('GetDefaultPlugin() should return a valid plugin object', (done) => {
    assert.strictEqual(typeof plugin, 'object', 'Default Plugin should be of type');
    var expectedFunctions = ['getDownloadURL', 'getSemver', 'processBinary', 'postProcess'];
    var actualFunctions = Object.keys(plugin);
    expectedFunctions.forEach(expectedFunction => {
      assert.ok(actualFunctions.includes(expectedFunction), `Default Plugin should contain property '${expectedFunction}'`);
      assert.strictEqual(typeof plugin[expectedFunction], 'function', `Default Plugin property '${expectedFunction}' type should be`);
    });

    done();
  });

  it('getSemver() should fail with no arguments', (done) => {
    // @ts-ignore
    plugin.getSemver().then(version => {
      done(Error(`should have failed, but returned '${version}' instead.`));
    }).catch(err => {
      try {
        assert.ok(err instanceof Error, '\'err\' should be an error type');
        assert.strictEqual(err.message, 'Parameter \'version\' (undefined) is not a string, or empty, or consists only of whitespace characters.', 'error message should be');

        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('getSemver() should fail with empty string', (done) => {
    // @ts-ignore
    plugin.getSemver('').then(version => {
      done(Error(`should have failed, but returned '${version}' instead.`));
    }).catch(err => {
      try {
        assert.ok(err instanceof Error, '\'err\' should be an error type');
        assert.strictEqual(err.message, 'Parameter \'version\' () is not a string, or empty, or consists only of whitespace characters.', 'error message should be');

        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('getSemver() should fail with whitespace string', (done) => {
    // @ts-ignore
    plugin.getSemver(' \t').then(version => {
      done(Error(`should have failed, but returned '${version}' instead.`));
    }).catch(err => {
      try {
        assert.ok(err instanceof Error, '\'err\' should be an error type');
        assert.strictEqual(err.message, 'Parameter \'version\' ( \t) is not a string, or empty, or consists only of whitespace characters.', 'error message should be');

        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('getSemver() should succeed with semver compatible version specification', (done) => {
    var ver = '1.2.3';
    plugin.getSemver(ver, plugin).then(version => {
      assert.strictEqual(version, ver, 'returned version should be');

      done();
    }).catch(err => {
      done(err);
    });
  });

  it('getSemver() should succeed with semver compatible prerelease version specification', (done) => {
    var ver = '1.2.3-alpha';
    plugin.getSemver(ver, plugin).then(version => {
      assert.strictEqual(version, ver, 'returned version should be');

      done();
    }).catch(err => {
      done(err);
    });
  });

  it('getSemver() should succeed with semver 2-digit version specification', (done) => {
    plugin.getSemver('1.2', plugin).then(version => {
      assert.strictEqual(version, '1.2.0', 'returned version should be');

      done();
    }).catch(err => {
      done(err);
    });
  });

  it('getSemver() should succeed with semver 1-digit version specification', (done) => {
    plugin.getSemver('1', plugin).then(version => {
      assert.strictEqual(version, '1.0.0', 'returned version should be');

      done();
    }).catch(err => {
      done(err);
    });
  });

  it('getSemver() should succeed with semver 4-digit version specification', (done) => {
    plugin.getSemver('1.2.3.4', plugin).then(version => {
      assert.strictEqual(version, '1.2.3-4', 'returned version should be');

      done();
    }).catch(err => {
      done(err);
    });
  });

  it('getSemver() should succeed with semver 3-digit+ version specification', (done) => {
    plugin.getSemver('1.2.3.a.b.c', plugin).then(version => {
      assert.strictEqual(version, '1.2.3-a.b.c', 'returned version should be');

      done();
    }).catch(err => {
      done(err);
    });
  });

  it('getSemver() should succeed with malformed semver prerelease version specification', (done) => {
    plugin.getSemver('1.2.3-', plugin).then(version => {
      assert.strictEqual(version, '1.2.3', 'returned version should be');

      done();
    }).catch(err => {
      done(err);
    });
  });

  it('getSemver() should succeed with arbitrate text version specification', (done) => {
    plugin.getSemver('arbitrate text', plugin).then(version => {
      assert.strictEqual(version, '0.0.0-arbitrate.text', 'returned version should be');

      done();
    }).catch(err => {
      done(err);
    });
  });
});

describe(`${thisPackage.name} tests`, function () {
  it('GetLatestReleaseURLSync() should succeed', (done) => {
    var result = grp.GetLatestReleaseURLSync('notebooksbilliger', 'npmbuildtools');

    assert.ok(result, 'result should not be undefined');
    assert.strictEqual(typeof result, 'string', 'result type should be string');
    assert.ok(result.length > 0, 'result should not be empty');

    done();
  });

  it('UpdatePackageSync() should fail', (done) => {
    var expected = path.join(path.dirname(__filename), 'package.json');

    try {
      grp.UpdatePackageSync();
      throw Error('should have failed');
    } catch (err) {
      assert.ok(err instanceof Error, 'thrown type should be \'Error\'');
      assert.strictEqual(err.message, `Package file '${expected}' could not be found.`, 'error message should be');
    }

    done();
  });

  it('UpdateBinarySync() should fail', (done) => {
    var expected = path.join(path.dirname(__filename), 'package.json');

    try {
      grp.UpdateBinarySync();
      throw Error('should have failed');
    } catch (err) {
      assert.ok(err instanceof Error, 'thrown type should be \'Error\'');
      assert.strictEqual(err.message, `Package file '${expected}' could not be found.`, 'error message should be');
    }

    done();
  });
});
