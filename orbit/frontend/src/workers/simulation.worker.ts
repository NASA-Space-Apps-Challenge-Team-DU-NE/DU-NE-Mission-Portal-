/// <reference lib="webworker" />
import { DataUnavailable, loadAssets, type Assets } from '../physics/data';
import { runSimulation } from '../physics/simulator';
import { normalizeNRHOSettings } from '../physics/ephemeris/settings';
import { Ephemeris, loadEphemeris } from '../physics/ephemeris/data';
import { GrailGravityModel, loadGravityData } from '../physics/gravity/model';
import { runEphemerisMission } from '../physics/ephemeris/mission';
import type { Config } from '../types';

let assets: Promise<Assets> | undefined;
self.onmessage = async (event: MessageEvent<{ type: string; id: string; config: Config; assetBase?: string }>) => {
  const { type, id, config: input, assetBase } = event.data;
  if (type !== 'RUN') return;
  const progress = (message: string) => self.postMessage({ type: 'PROGRESS', id, message });
  try {
    const config = input.initial_orbit === 'nrho' ? { ...input, nrho: normalizeNRHOSettings(input.nrho) } : input;
    progress('Loading local static NASA/SPICE assets');
    assets ??= loadAssets(assetBase ?? new URL('data/', self.location.origin + import.meta.env.BASE_URL).href);
    const base = assetBase ?? new URL('data/', self.location.origin + import.meta.env.BASE_URL).href;
    const modeB=async()=>{
      let eph=await loadEphemeris(base);
      if(config.nrho?.gravity_model==='grail'){
        progress('검증된 GL1800F 정적 계수·DE440 PA 좌표계 로딩');
        const model=new GrailGravityModel(await loadGravityData(base),eph.frames,config.nrho.gravity_degree??30);
        eph=new Ephemeris(eph.data,model);
      }
      return runEphemerisMission(config,await assets!,eph,progress);
    };
    const result = config.initial_orbit === 'nrho'
      ? await modeB()
      : await runSimulation(config, await assets, progress);
    self.postMessage({ type: 'RESULT', id, result });
  } catch (e) {
    if (e instanceof DataUnavailable) {
      self.postMessage({ type: 'RESULT', id, result: { status: 'DATA UNAVAILABLE', trajectory: [], summary: {}, validation: {}, message: e.message, warnings: [e.message] } });
    } else self.postMessage({ type: 'ERROR', id, error: e instanceof Error ? e.message : String(e) });
  }
};
