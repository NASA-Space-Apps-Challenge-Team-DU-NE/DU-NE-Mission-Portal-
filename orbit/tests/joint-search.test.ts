import test from 'node:test';
import assert from 'node:assert/strict';
import {betterMission,interleaveHeadings,missionScore} from '../frontend/src/physics/ephemeris/jointSearch';
test('joint ranking includes transfer cost and avoids the reviewed descent-only counterexample',()=>{
 const cheapDescent={totalDeltaV:3914.22,totalFuel:2125.33,flightSeconds:270000};
 const cheapMission={totalDeltaV:2778.43,totalFuel:1219.51,flightSeconds:270100};
 assert.ok(betterMission(cheapMission,cheapDescent,'delta_v'));assert.ok(betterMission(cheapMission,cheapDescent,'balanced'));
 assert.ok(betterMission(cheapDescent,cheapMission,'time'));
 assert.equal(missionScore({totalDeltaV:2000,totalFuel:1000,flightSeconds:86400},'balanced'),2100);
 assert.equal(missionScore({...cheapMission,totalDeltaV:NaN},'delta_v'),Infinity);
});
test('candidate scheduling preserves every landing seed and visits each approach direction first',()=>{
 const seeds=[{heading:90,id:1},{heading:90,id:2},{heading:180,id:3},{heading:270,id:4},{heading:0,id:5},{heading:180,id:6}];
 const original=[...seeds],order=interleaveHeadings(seeds);
 assert.deepEqual(order.slice(0,4).map(x=>x.heading),[90,180,270,0]);
 assert.deepEqual(order.map(x=>x.id).sort(),seeds.map(x=>x.id).sort());assert.deepEqual(seeds,original);
});
