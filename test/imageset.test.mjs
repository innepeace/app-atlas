import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveImageset } from '../lib/imageset.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const contents = JSON.parse(readFileSync(join(here, 'fixtures/imageset/Contents.json'), 'utf8'));

test('优先取 3x 文件名', () => {
  assert.equal(resolveImageset(contents), 'order_entry@3x.png');
});

test('无可用文件名返回 null', () => {
  assert.equal(resolveImageset({ images: [{ scale: '1x' }] }), null);
});

test('对空/缺失输入安全返回 null', () => {
  assert.equal(resolveImageset(undefined), null);
  assert.equal(resolveImageset({}), null);
});
