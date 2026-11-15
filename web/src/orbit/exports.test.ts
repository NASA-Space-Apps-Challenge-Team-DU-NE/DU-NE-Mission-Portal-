import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ORBIT_DEFAULT, configKey, type SimulationResult } from './model';
import type { OrbitRun } from '../state/orbitRun';
import { orbitEvaluation, orbitCsvCells, ORBIT_CSV_HEADERS, orbitReportSection } from './exports';
const caps=JSON.parse(readFileSync('../orbit/frontend/public/integration/capabilities.json','utf8'));
const config=structuredClone(ORBIT_DEFAULT);
const result={status:'VALIDATED',trajectory:[{}],summary:{total_delta_v_m_s:3415.99,propellant_consumed_kg:1421.3,landing_position_error_m:0.00001},validation:Object.fromEntries(caps.required_checks.map((k:string)=>[k,{passed:true}]))} as unknown as SimulationResult;
const run={phase:'complete',input:config,inputKey:configKey(config),result,buildId:caps.buildId,error:null} as OrbitRun;
it('exports only matching validated mission metrics and their original units',()=>{
 const cells=orbitCsvCells(config,run,caps);expect(cells).toHaveLength(ORBIT_CSV_HEADERS.length);
 const row=Object.fromEntries(ORBIT_CSV_HEADERS.map((k,i)=>[k,cells[i]]));expect(row.orbit_status).toBe('VALIDATED');expect(row.orbit_total_delta_v_m_s).toBe(3415.99);expect(row.orbit_checks_passed).toBe(20);expect(JSON.parse(String(row.orbit_input_json))).toEqual(config);
});
it('never attaches the current result to another candidate, date or propulsion setup',()=>{
 for(const change of [(c:typeof config)=>{c.target.latitude_deg+=0.001;},(c:typeof config)=>{c.target.landing_time_utc='2026-11-17T00:00:00Z';},(c:typeof config)=>{c.lander.max_thrust_n+=1;}]){const c=structuredClone(config);change(c);expect(orbitEvaluation(c,run,caps)).toEqual({status:'NOT_CALCULATED',result:null,buildId:''});}
});
it('does not export stale, cancelled or running metrics as completed results',()=>{
 for(const phase of ['running','cancelled','stale','error'] as const)expect(orbitEvaluation(config,{...run,phase},caps).result).toBeNull();
 expect(orbitEvaluation(config,{...run,buildId:'old'},caps).status).toBe('STALE_BUILD');
});
it('keeps failure and incomplete validation distinct from success',()=>{
 expect(orbitEvaluation(config,{...run,result:{...result,status:'DATA UNAVAILABLE',trajectory:[],validation:{}}},caps).status).toBe('DATA UNAVAILABLE');
 expect(orbitEvaluation(config,{...run,result:{...result,validation:{}}},caps).status).toBe('INVALID_RESULT');
});
it('report includes full inputs, checks and provenance in either language without translating raw values',()=>{
 for(const lang of ['ko','en'] as const){const report=orbitReportSection(config,run,caps,lang);expect(report.lines.join('\n')).toContain('3415.99');expect(report.lines.join('\n')).toContain('20/20');expect(report.lines.join('\n')).toContain(caps.buildId);expect(report.lines.join('\n')).toContain(JSON.stringify(config));}
});
it('uncomputed reports do not substitute example results',()=>{
 const report=orbitReportSection(config,{...run,input:null,result:null,phase:'idle'},caps,'en').lines.join('\n');expect(report).toContain('NOT_CALCULATED');expect(report).not.toContain('3415.99');
});
