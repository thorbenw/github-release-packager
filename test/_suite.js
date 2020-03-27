const os = require('os');
// const fs = require('fs-extra');
const path = require('path');
const assert = require('assert');
// const semver = require('semver');
const grp = require('../index');
// @ts-ignore
const thisPackage = require('../package.json');

console.log(`${os.EOL}Running Mocha Test Suite ...`);

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
      grp.UpdatePackageSync({});
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
      grp.UpdateBinarySync({}, undefined, undefined);
      throw Error('should have failed');
    } catch (err) {
      assert.ok(err instanceof Error, 'thrown type should be \'Error\'');
      assert.strictEqual(err.message, `Package file '${expected}' could not be found.`, 'error message should be');
    }

    done();
  });
});
