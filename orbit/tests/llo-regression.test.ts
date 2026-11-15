import test from 'node:test';
import assert from 'node:assert/strict';
import { runSimulation } from '../frontend/src/physics/simulator';
import { loadAssets } from '../frontend/src/physics/data';
import { installStaticFetch, readJson } from './static-assets';

test('LLO regression: both pre-NRHO landing cases preserve numerical results within floating-point roundoff', async () => {
  const local=installStaticFetch();
  try {
    const baseline=await readJson('docs/llo-regression-baseline.json');
    const assets=await loadAssets('/data/');
    for (const old of baseline.tests.filter((r:{status:string})=>r.status==='VALIDATED')) {
      const result=await runSimulation(old.input,assets);
      assert.equal(result.status,old.status);
      for (const key of ['landing_position_error_m','touchdown_velocity_m_s','total_delta_v_m_s','propellant_consumed_kg','flight_duration_s','final_mass_kg']) {
        const actual=result.summary[key],expected=old.summary[key];
        assert.ok(typeof actual==='number' && typeof expected==='number' && Number.isFinite(actual) && Number.isFinite(expected),key);
        // OS/Node의 삼각함수 반올림 차이만 허용한다. 시뮬레이터의 착륙 제약은 바꾸지 않는다.
        const tolerance=1e-8+1e-12*Math.max(Math.abs(actual),Math.abs(expected));
        assert.ok(Math.abs(actual-expected)<=tolerance,`${key}: ${actual} vs ${expected} (tolerance ${tolerance})`);
      }
    }
  } finally {local.restore();}
});
