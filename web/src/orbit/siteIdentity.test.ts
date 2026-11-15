import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { useApp } from '../state/store';
import { useData } from '../state/data';
import type { Site } from '../core/types';
import { ORBIT_DEFAULT } from './model';
import { resolveOrbitSite } from './siteIdentity';
const sites = JSON.parse(readFileSync('public/data/catalog/sites.json','utf8')).data as Site[];
const target = ORBIT_DEFAULT.target;
const ref = {kind:'catalog',id:'connecting_ridge'} as const;
beforeEach(() => { useApp.setState(useApp.getInitialState(), true); useData.setState({sites:{items:sites,env:null}}); });
describe('Orbit restores portal site identity', () => {
 it('preserves catalog identity, mask and source metadata on mission application', () => {
  useApp.getState().applyOrbitConfig(ORBIT_DEFAULT, ref);
  expect(useApp.getState().siteRef).toEqual(ref);
  const site=useData.getState().sites.items.find(s=>s.id===ref.id)!;
  expect(site.mask).toBe('masks/connecting_ridge.json');expect(site.source_keys).toContain('wueller_2026');
 });
 it('recovers an exact catalog match from legacy coordinate-only JSON', () => {
  useApp.getState().setSite({kind:'custom',lat:target.latitude_deg,lon:target.longitude_deg});
  useApp.getState().applyOrbitConfig(JSON.parse(JSON.stringify(ORBIT_DEFAULT)));
  expect(useApp.getState().siteRef).toEqual(ref);
 });
 it('does not snap a nearby custom target to the catalog', () => {
  const c=structuredClone(ORBIT_DEFAULT);c.target.latitude_deg+=0.000001;
  useApp.getState().applyOrbitConfig(c);
  expect(useApp.getState().siteRef).toEqual({kind:'custom',lat:c.target.latitude_deg,lon:c.target.longitude_deg});
 });
 it('honors an explicitly saved custom point even at catalog coordinates', () => {
  const custom={kind:'custom',lat:target.latitude_deg,lon:target.longitude_deg} as const;
  useApp.getState().applyOrbitConfig(ORBIT_DEFAULT,custom);expect(useApp.getState().siteRef).toEqual(custom);
 });
 it('rejects changed or missing catalog coordinates before mutating any plan state', () => {
  const before=useApp.getState();const c=structuredClone(ORBIT_DEFAULT);c.target.latitude_deg+=0.01;
  expect(()=>useApp.getState().applyOrbitConfig(c,ref)).toThrow(/일치/);
  expect(useApp.getState()).toBe(before);
  expect(()=>useApp.getState().applyOrbitConfig(ORBIT_DEFAULT,{kind:'catalog',id:'missing'})).toThrow(/일치/);
 });
 it('restores a south-grid cell by exact coordinates and rejects stale indices', () => {
  const grid={lat:new Float64Array([target.latitude_deg]),lon:new Float64Array([target.longitude_deg])};
  expect(resolveOrbitSite(target,null,sites,grid,{kind:'cell',cell:0})).toEqual({kind:'cell',cell:0});
  expect(()=>resolveOrbitSite(target,null,sites,grid,{kind:'cell',cell:1})).toThrow(/일치/);
 });
 it('does not guess between duplicate catalog coordinates', () => {
  const same=sites.find(s=>s.id===ref.id)!;
  expect(resolveOrbitSite(target,null,[same,{...same,id:'duplicate'}],null).kind).toBe('custom');
  expect(resolveOrbitSite(target,ref,[same,{...same,id:'duplicate'}],null)).toEqual(ref);
 });
 it('reset uses the same catalog identity as initial startup', () => {
  useApp.getState().resetInputs();expect(useApp.getState().siteRef).toEqual(ref);
 });
});
