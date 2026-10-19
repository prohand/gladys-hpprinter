// -----------------------------------------------------------------------------
// The changelog roll run by the Release workflow.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-hpprinter';

test('the Unreleased section moves under the version, an empty one stays on top', () => {
  const before = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Printers.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const after = rollChangelog(before, '1.0.1', '2026-10-20');
  assert.match(
    after,
    /## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-10-20\n\n### Added\n\n- Printers\.\n/,
  );
  assert.match(after, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.1\\.\\.\\.HEAD`));
  assert.match(after, new RegExp(`\\[1\\.0\\.1\\]: ${REPO}/releases/tag/v1\\.0\\.1`));
});

test('a release without notes still gets its heading, and is never rolled twice', () => {
  const before = `## [Unreleased]\n\n[Unreleased]: ${REPO}/compare/v1.0.1...HEAD\n`;
  const after = rollChangelog(before, '1.0.2', '2026-10-21');
  assert.match(after, /## \[1\.0\.2\] - 2026-10-21\n\n- Maintenance release/);
  assert.match(after, new RegExp(`\\[1\\.0\\.2\\]: ${REPO}/compare/v1\\.0\\.1\\.\\.\\.v1\\.0\\.2`));
  assert.equal(rollChangelog(after, '1.0.2', '2026-10-21'), after);
});
