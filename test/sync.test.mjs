import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectStale, applyStale, collectSyncTargets } from '../lib/sync.mjs';

test('detectStale 跳过未收集屏与无 sourceRev 屏', () => {
  const changed = () => ['x.swift'];
  const res = detectStale({
    currentRev: 'HEAD1',
    screens: [
      { id: 'a', status: 'uncollected', sourceRev: 'r1', files: ['x.swift'] },
      { id: 'b', status: 'collected', sourceRev: null, files: ['x.swift'] },
    ],
    changedFilesSince: changed,
  });
  assert.equal(res.length, 0);
});

test('detectStale sourceRev 等于 currentRev 时直接非陈旧，不调用 git', () => {
  let called = false;
  const res = detectStale({
    currentRev: 'HEADX',
    screens: [{ id: 'a', status: 'collected', sourceRev: 'HEADX', files: ['x.swift'] }],
    changedFilesSince: () => { called = true; return []; },
  });
  assert.equal(called, false);
  assert.equal(res[0].stale, false);
  assert.deepEqual(res[0].changed, []);
});

test('detectStale 有文件变更则标记陈旧并带出变更文件', () => {
  const res = detectStale({
    currentRev: 'HEAD2',
    screens: [{ id: 'a', status: 'collecting', sourceRev: 'r1', files: ['a.swift', 'b.swift'] }],
    changedFilesSince: (rev, files) => {
      assert.equal(rev, 'r1');
      assert.deepEqual(files, ['a.swift', 'b.swift']);
      return ['b.swift'];
    },
  });
  assert.equal(res[0].stale, true);
  assert.deepEqual(res[0].changed, ['b.swift']);
});

test('detectStale 无文件变更则非陈旧', () => {
  const res = detectStale({
    currentRev: 'HEAD2',
    screens: [{ id: 'a', status: 'collected', sourceRev: 'r1', files: ['a.swift'] }],
    changedFilesSince: () => [],
  });
  assert.equal(res[0].stale, false);
});

test('applyStale 按结果更新 registry 的 stale 字段并返回新对象', () => {
  const reg = {
    schemaVersion: 1,
    modules: [
      { id: 'm', screens: [
        { id: 'a', stale: false }, { id: 'b', stale: true }, { id: 'c', stale: false },
      ] },
    ],
  };
  const next = applyStale(reg, [
    { id: 'a', stale: true, changed: ['x'] },
    { id: 'b', stale: false, changed: [] },
  ]);
  assert.equal(next.modules[0].screens[0].stale, true);
  assert.equal(next.modules[0].screens[1].stale, false);
  assert.equal(next.modules[0].screens[2].stale, false);
  // 原对象不被修改
  assert.equal(reg.modules[0].screens[0].stale, false);
  assert.equal(reg.modules[0].screens[1].stale, true);
});

test('collectSyncTargets 从 registry 抽取需检查的屏（收集中/已收集）', () => {
  const reg = {
    modules: [
      { id: 'm1', screens: [
        { id: 'a', status: 'collected', sourceRev: 'r1' },
        { id: 'b', status: 'uncollected', sourceRev: null },
      ] },
      { id: 'm2', screens: [
        { id: 'c', status: 'collecting', sourceRev: 'r2' },
      ] },
    ],
  };
  const targets = collectSyncTargets(reg);
  assert.deepEqual(targets.map(t => t.id), ['a', 'c']);
  assert.equal(targets[0].status, 'collected');
});
