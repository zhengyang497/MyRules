const { test } = require('node:test');
const assert = require('node:assert');
const transform = require('../tools/sync/lib/transform');

test('transformForCursor adds alwaysApply frontmatter and keeps body', () => {
  const out = transform.transformForCursor('# Hello\n\n- one\n- two', 'greeting');
  assert.match(out, /alwaysApply: true/);
  assert.match(out, /description: "MyRules: greeting"/);
  assert.match(out, /# Hello/);
  assert.match(out, /- one/);
});

test('transformForClaude returns the body unchanged, no frontmatter added', () => {
  const out = transform.transformForClaude('# Hello\n\n- one');
  assert.strictEqual(out, '# Hello\n\n- one');
  assert.doesNotMatch(out, /alwaysApply/);
});

test('stripCursorFrontmatter removes the frontmatter block and keeps the body', () => {
  const mdc = '---\ndescription: "MyRules: greeting"\nalwaysApply: true\n---\n\n# Hello\n\n- one';
  const body = transform.stripCursorFrontmatter(mdc);
  assert.strictEqual(body, '# Hello\n\n- one');
});

test('stripCursorFrontmatter returns content unchanged if there is no frontmatter', () => {
  const plain = '# Hello\n\n- one';
  assert.strictEqual(transform.stripCursorFrontmatter(plain), plain);
});
