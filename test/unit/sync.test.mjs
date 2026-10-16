import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePacks, emptyPack, seedToPack, pruneTombstones, isPack } from '../../src/store/sync.js';
import { buildSeed } from '../../src/logic/seed.js';

const pk = (docs, mt = {}, del = {}) => ({ ...emptyPack(), docs, mt, del });

test('birleştirme: farklı kayıtlar korunur, aynı kayıtta yenisi kazanır', () => {
  const a = pk({ 'crids/1': { t: 'A1' }, 'crids/2': { t: 'A2' } }, { 'crids/1': 10, 'crids/2': 30 });
  const b = pk({ 'crids/2': { t: 'B2' }, 'crids/3': { t: 'B3' } }, { 'crids/2': 20, 'crids/3': 5 });
  const m = mergePacks(a, b);
  assert.deepEqual(Object.keys(m.docs).sort(), ['crids/1', 'crids/2', 'crids/3']);
  assert.equal(m.docs['crids/2'].t, 'A2');
  assert.equal(m.mt['crids/2'], 30);
  assert.deepEqual(mergePacks(b, a).docs, m.docs, 'birleştirme sırası sonucu değiştirmemeli');
});

test('birleştirme: silme (mezar taşı) eski değişikliği ezer, yeni değişiklik silmeyi ezer', () => {
  const a = pk({}, {}, { 'subs/x': 50 });
  const b = pk({ 'subs/x': { v: 1 } }, { 'subs/x': 40 });
  const m = mergePacks(a, b);
  assert.equal('subs/x' in m.docs, false);
  assert.equal(m.del['subs/x'], 50);
  const c = pk({ 'subs/x': { v: 2 } }, { 'subs/x': 60 });
  const m2 = mergePacks(m, c);
  assert.equal(m2.docs['subs/x'].v, 2);
  assert.equal(m2.del['subs/x'], undefined);
});

test('birleştirme: boş/geçersiz girdiler', () => {
  const a = pk({ 'x/1': { a: 1 } }, { 'x/1': 1 });
  assert.deepEqual(mergePacks(a, null).docs, a.docs);
  assert.deepEqual(mergePacks({ foo: 1 }, a).docs, a.docs);
  assert.equal(isPack({ format: 'crid-data', docs: {} }), true);
  assert.equal(isPack({ docs: {} }), false);
});

test('örnek veri paketi ve mezar taşı temizliği', () => {
  const p = seedToPack(buildSeed());
  assert.ok(p.docs['master/main'] && p.docs['meta/counters']);
  assert.equal(Object.keys(p.docs).filter((k) => k.startsWith('crids/')).length, 46);
  assert.ok(!('id' in p.docs['crids/crid-sample-001']));
  const q = pk({}, {}, { 'a/1': 1, 'a/2': Date.now() });
  pruneTombstones(q);
  assert.deepEqual(Object.keys(q.del), ['a/2']);
});
