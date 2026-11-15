import { expect, it, vi } from 'vitest';
import dictionary from '../../../orbit/frontend/src/i18n/en.json';
import { translateOrbit } from '../../../orbit/frontend/src/i18n/translate';
it('covers all prepared static and parameterized Orbit messages without losing placeholders',()=>{
 for(const [ko,en] of Object.entries(dictionary)){
  const sample=(s:string)=>s.replace(/\{(\d+)\}/g,(_,n)=>String(12.25+Number(n)));
  expect(translateOrbit(sample(ko),'en'),ko).toBe(sample(en));expect(translateOrbit(ko,'ko')).toBe(ko);
 }
});
it('keeps numerical values, units and scientific identifiers unchanged',()=>{
 expect(translateOrbit('GRAIL 30차','en')).toBe('GRAIL degree 30');
 expect(translateOrbit('유한 연소 · 30.60초 · 12.00 kN','en')).toBe('Finite burn · 30.60 s · 12.00 kN');
 expect(translateOrbit('J2000 / MOON_ME / 0.499999 m/s','en')).toBe('J2000 / MOON_ME / 0.499999 m/s');
});

it('keeps existing portal translations intact in labels and report lines',async()=>{
 vi.stubGlobal('document',{title:'DU:NE'});
 try {
  const {tx}=await import('../i18n');
  expect(tx('선택 착륙지')).toBe('Selected site');
  expect(tx('## 선택 착륙지')).toBe('## Selected site');
  expect(tx('지금 계획')).toBe('Current plan');
  expect(tx('GRAIL 30차')).toBe('GRAIL degree 30');
  expect(tx('유한 연소 · 30.60초 · 12.00 kN')).toBe('Finite burn · 30.60 s · 12.00 kN');
 } finally {vi.unstubAllGlobals();}
});
