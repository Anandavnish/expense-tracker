// app/test_version_service.mjs
// Verification of App Version Comparison, SemVer, and GitHub Release logic

import assert from 'assert';

function compareSemVer(v1, v2) {
  const clean = (v) =>
    (v || '')
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map(part => parseInt(part, 10) || 0);

  const p1 = clean(v1);
  const p2 = clean(v2);
  const maxLen = Math.max(p1.length, p2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = p1[i] ?? 0;
    const num2 = p2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

function evaluateUpdateStatus(currentVersionCode, currentVersion, latestRelease) {
  if (!latestRelease) {
    return { hasUpdate: false, isMandatory: false };
  }

  const isNewerCode = latestRelease.version_code > 0 && latestRelease.version_code > currentVersionCode;
  const isNewerSemver = compareSemVer(latestRelease.version, currentVersion) > 0;
  const hasUpdate = isNewerCode || isNewerSemver;

  const isMandatory =
    latestRelease.is_critical ||
    (typeof latestRelease.min_version_code === 'number' &&
      currentVersionCode < latestRelease.min_version_code);

  return {
    hasUpdate,
    isMandatory: !!isMandatory,
    release: latestRelease,
    currentVersion,
    currentVersionCode,
  };
}

console.log('--- RUNNING VERSION SERVICE & UPDATE LOGIC TESTS ---');

// Test 1: SemVer Comparison
assert.strictEqual(compareSemVer('1.0.2', '1.0.0'), 1);
assert.strictEqual(compareSemVer('1.0.0', '1.0.2'), -1);
assert.strictEqual(compareSemVer('v1.0.2', '1.0.2'), 0);
assert.strictEqual(compareSemVer('1.2.0', '1.1.9'), 1);
assert.strictEqual(compareSemVer('2.0.0', '1.9.9'), 1);
assert.strictEqual(compareSemVer('1.0.0', '1.0.0'), 0);
console.log('✅ Test 1 Passed: SemVer comparisons evaluate correctly');

// Test 2: User is on same version (1.0.0, build 1)
const sameRelease = {
  version: '1.0.0',
  version_code: 1,
  title: 'Current Version',
  release_notes: 'Initial release',
  download_url: 'https://example.com/apk-v1.0.0.apk',
  is_critical: false,
};
const res1 = evaluateUpdateStatus(1, '1.0.0', sameRelease);
assert.strictEqual(res1.hasUpdate, false);
assert.strictEqual(res1.isMandatory, false);
console.log('✅ Test 2 Passed: Up to date when version and code match');

// Test 3: Optional GitHub Release update available (v1.0.2, build 3 vs installed 1.0.0, build 1)
const githubRelease = {
  version: '1.0.2',
  version_code: 3,
  title: 'Expense Tracker v1.0.2',
  release_notes: 'Adaptive SMS learning, bank logos, APK auto-updater',
  download_url: 'https://github.com/Anandavnish/expense-tracker/releases/download/v1.0.2/ExpenseTracker-v1.0.2.apk',
  is_critical: false,
};
const res2 = evaluateUpdateStatus(1, '1.0.0', githubRelease);
assert.strictEqual(res2.hasUpdate, true);
assert.strictEqual(res2.isMandatory, false);
assert.strictEqual(res2.release.version, '1.0.2');
assert.strictEqual(res2.release.download_url.includes('ExpenseTracker-v1.0.2.apk'), true);
console.log('✅ Test 3 Passed: Optional GitHub release detected when version > current');

// Test 4: Critical mandatory update
const criticalRelease = {
  version: '2.0.0',
  version_code: 5,
  title: 'Critical Database Upgrade',
  release_notes: '[critical] Required ledger migration',
  download_url: 'https://example.com/apk-v2.0.0.apk',
  is_critical: true,
  min_version_code: 5,
};
const res3 = evaluateUpdateStatus(1, '1.0.0', criticalRelease);
assert.strictEqual(res3.hasUpdate, true);
assert.strictEqual(res3.isMandatory, true);
console.log('✅ Test 4 Passed: Mandatory update detected when is_critical is true or below min_version_code');

// Test 5: Offline / No release record
const res4 = evaluateUpdateStatus(1, '1.0.0', null);
assert.strictEqual(res4.hasUpdate, false);
assert.strictEqual(res4.isMandatory, false);
console.log('✅ Test 5 Passed: Graceful fallback when release record is null');

console.log('\n--- ALL VERSION SERVICE TESTS PASSED ---');

