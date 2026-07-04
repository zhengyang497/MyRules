// tests/session-start-context-hook.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const hook = require('../hooks/project/session-start-context');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hook-project-'));
}

test('meta declares the sessionStart event and a description', () => {
  assert.strictEqual(hook.meta.event, 'sessionStart');
  assert.ok(hook.meta.description.length > 0);
});

test('handle returns {} when .myrules-context.md does not exist', () => {
  const project = tmpProject();
  const result = hook.handle({ workspace_roots: [project] });
  assert.deepStrictEqual(result, {});
});

test('handle returns the file content as additional_context when it exists', () => {
  const project = tmpProject();
  fs.writeFileSync(path.join(project, '.myrules-context.md'), '# Status\n\nWorking on X');
  const result = hook.handle({ workspace_roots: [project] });
  assert.strictEqual(result.additional_context, '# Status\n\nWorking on X');
});

test('handle prefers CURSOR_PROJECT_DIR over workspace_roots when set', () => {
  const project = tmpProject();
  fs.writeFileSync(path.join(project, '.myrules-context.md'), 'from env');
  const prevEnv = process.env.CURSOR_PROJECT_DIR;
  process.env.CURSOR_PROJECT_DIR = project;
  try {
    const result = hook.handle({ workspace_roots: ['/some/other/path'] });
    assert.strictEqual(result.additional_context, 'from env');
  } finally {
    if (prevEnv === undefined) delete process.env.CURSOR_PROJECT_DIR;
    else process.env.CURSOR_PROJECT_DIR = prevEnv;
  }
});

test('running the file directly via stdin/stdout returns additional_context for valid input', () => {
  const { execFileSync } = require('node:child_process');
  const project = tmpProject();
  fs.writeFileSync(path.join(project, '.myrules-context.md'), 'hello from file');
  const hookPath = path.join(__dirname, '..', 'hooks', 'project', 'session-start-context.js');
  const output = execFileSync('node', [hookPath], {
    input: JSON.stringify({ workspace_roots: [project] }),
    encoding: 'utf8',
  });
  assert.deepStrictEqual(JSON.parse(output), { additional_context: 'hello from file' });
});

test('running the file directly via stdin/stdout prints {} for malformed input instead of crashing', () => {
  const { execFileSync } = require('node:child_process');
  const hookPath = path.join(__dirname, '..', 'hooks', 'project', 'session-start-context.js');
  const output = execFileSync('node', [hookPath], { input: 'not valid json', encoding: 'utf8' });
  assert.strictEqual(output.trim(), '{}');
});

test('running the file directly via stdin/stdout accepts UTF-8 BOM-prefixed JSON from Cursor', () => {
  const { execFileSync } = require('node:child_process');
  const project = tmpProject();
  fs.writeFileSync(path.join(project, '.myrules-context.md'), 'hello with bom');
  const hookPath = path.join(__dirname, '..', 'hooks', 'project', 'session-start-context.js');
  const output = execFileSync('node', [hookPath], {
    input: '\uFEFF' + JSON.stringify({ workspace_roots: [project] }),
    encoding: 'utf8',
  });
  assert.deepStrictEqual(JSON.parse(output), { additional_context: 'hello with bom' });
});
