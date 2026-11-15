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
    const cases=baseline.tests.filter((r:{status:string})=>r.status==='VALIDATED');
    assert.equal(cases.length,2,'Both historical landing cases must be exercised');
    const differences:string[]=[];
    for (const old of cases) {
      const result=await runSimulation(old.input,assets);
      assert.equal(result.status,old.status);
      for (const key of ['landing_position_error_m','touchdown_velocity_m_s','total_delta_v_m_s','propellant_consumed_kg','flight_duration_s','final_mass_kg']) {
        const actual=result.summary[key],expected=old.summary[key];
        assert.ok(typeof actual==='number' && typeof expected==='number' && Number.isFinite(actual) && Number.isFinite(expected),key);
        // 파생 SI 요약값의 회귀 비교 정밀도: 절대 1e-6 + 상대 1e-12.
        // Linux/Node 22에서 관측한 잔차 차이(최대 2.72e-8 m)를 포함한다.
        // 시뮬레이터·접촉·속도·추력 제약에는 이 값을 적용하지 않는다.
        const tolerance=1e-6+1e-12*Math.max(Math.abs(actual),Math.abs(expected));
        if(Math.abs(actual-expected)>tolerance)differences.push(`${key}: ${actual} vs ${expected} (tolerance ${tolerance})`);
      }
    }
    assert.deepEqual(differences,[],'All historical metrics must remain within numerical comparison precision');
  } finally {local.restore();}
});
