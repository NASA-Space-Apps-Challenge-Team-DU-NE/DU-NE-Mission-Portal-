import test from 'node:test';
import assert from 'node:assert/strict';
import { runSimulation } from '../frontend/src/physics/simulator';
import { loadAssets } from '../frontend/src/physics/data';
import { installStaticFetch, readJson } from './static-assets';

test('LLO regression: both pre-NRHO landing cases preserve numerical results exactly', async () => {
  const local=installStaticFetch();
  try {
    const baseline=await readJson('docs/llo-regression-baseline.json');
    const assets=await loadAssets('/data/');
    for (const old of baseline.tests.filter((r:{status:string})=>r.status==='VALIDATED')) {
      const result=await runSimulation(old.input,assets);
      assert.equal(result.status,old.status);
      for (const key of ['landing_position_error_m','touchdown_velocity_m_s','total_delta_v_m_s','propellant_consumed_kg','flight_duration_s','final_mass_kg']) {
        assert.equal(result.summary[key],old.summary[key],key);
      }
    }
  } finally {local.restore();}
});
