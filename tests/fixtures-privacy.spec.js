// Guards tests/fixtures/*.json against ever picking up a real identifier.
// The model patients are Carmit Frisch's own anonymous case numbers
// (מטופל 50, מטופל 32) — dossier front matter: "No patient names or ID
// numbers used anywhere". Fixtures must carry only `anonId` (already the
// authors' own anonymous numbering), never a `name` or bare `id` key.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const DISALLOWED_KEYS = ['name', 'id', 'firstName', 'lastName', 'fullName'];

const fixtureFiles = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));

test('at least one fixture exists to guard', () => {
  expect(fixtureFiles.length).toBeGreaterThan(0);
});

for (const file of fixtureFiles) {
  test(`${file} carries only anonId, no name/id fields`, () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8'));

    for (const key of DISALLOWED_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(fixture, key), `fixture has "${key}" key`).toBe(
        false,
      );
    }
    expect(fixture.anonId, 'fixture should have anonId').toBeDefined();
  });
}
