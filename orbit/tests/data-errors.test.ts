import test from 'node:test';
import assert from 'node:assert/strict';
import { DataUnavailable, loadAssets } from '../frontend/src/physics/data';
import { installStaticFetch } from './static-assets';

test('Missing native LOLA tile rejects and never substitutes global terrain', async () => {
  const fake = installStaticFetch();
  try {
    const assets = await loadAssets('/data/');
    const normal = globalThis.fetch;
    globalThis.fetch = async input => String(input).includes('/tiles/')
      ? new Response('Not found', { status: 404 }) : normal(input);
    await assert.rejects(assets.terrain.prepare([[-89.4441, -137.291]]), DataUnavailable);
    assert.deepEqual(assets.terrain.elevation(-89.4441, -137.291), { height: null, source: 'UNAVAILABLE' });
  } finally { fake.restore(); }
});

test('Transient missing tile can be retried after the static host recovers', async () => {
  const fake = installStaticFetch();
  try {
    const assets = await loadAssets('/data/');
    const normal = globalThis.fetch;
    globalThis.fetch = async input => String(input).includes('/tiles/')
      ? new Response('Not found', { status: 404 }) : normal(input);
    await assert.rejects(assets.terrain.prepare([[-89.4441, -137.291]]), DataUnavailable);
    globalThis.fetch = normal;
    await assets.terrain.prepare([[-89.4441, -137.291]]);
    assert.equal(assets.terrain.elevation(-89.4441, -137.291).source, 'LOLA_240M');
  } finally { fake.restore(); }
});

test('Truncated tile is explicitly unavailable rather than accepted as science data', async () => {
  const fake = installStaticFetch();
  try {
    const assets = await loadAssets('/data/');
    const normal = globalThis.fetch;
    globalThis.fetch = async input => String(input).includes('/tiles/')
      ? new Response(new Uint8Array(100)) : normal(input);
    await assert.rejects(assets.terrain.prepare([[-89.4441, -137.291]]), DataUnavailable);
  } finally { fake.restore(); }
});

test('Same-length corrupted tile fails the prepared SHA-256 check', async () => {
  const fake = installStaticFetch();
  try {
    const assets = await loadAssets('/data/');
    const normal = globalThis.fetch;
    globalThis.fetch = async input => String(input).includes('/tiles/')
      ? new Response(new Uint8Array(256 * 256 * 2)) : normal(input);
    await assert.rejects(assets.terrain.prepare([[-89.4441, -137.291]]), DataUnavailable);
  } finally { fake.restore(); }
});

test('Landing terrain mesh does not mislabel out-of-cap coarse samples as240m', async () => {
  const fake = installStaticFetch();
  try {
    const assets = await loadAssets('/data/');
    const roi = await assets.terrain.roi(-75.01, 0, 18000, 9);
    assert.equal(roi.status, 'TERRAIN DATA UNAVAILABLE');
  } finally { fake.restore(); }
});

test('Corrupt global coarse grid cannot contribute to validated terrain', async () => {
  const fake = installStaticFetch();
  try {
    const normal = globalThis.fetch;
    for (const bytes of [100, 180 * 360 * 2]) {
      globalThis.fetch = async input => String(input).endsWith('/global.bin')
        ? new Response(new Uint8Array(bytes)) : normal(input);
      const assets = await loadAssets('/data/');
      assert.deepEqual(assets.terrain.elevation(0, 0), { height: null, source: 'UNAVAILABLE' });
      await assets.terrain.prepare([[-89.4441, -137.291]]);
      assert.equal(assets.terrain.elevation(-89.4441, -137.291).source, 'LOLA_240M');
    }
  } finally { fake.restore(); }
});
