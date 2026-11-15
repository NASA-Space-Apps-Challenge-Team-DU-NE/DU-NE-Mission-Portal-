// 05 궤도 분석: 자리만 만들어 둔다 (기능은 추후 구현). 입력은 01 임무 설정 › 착륙선 정보의 질량·추력·비추력.
import { Card, Help } from '../components/kit';
import { useApp } from '../state/store';
import { useUi } from '../state/ui';

export default function Orbit() {
  const ex = useApp((s) => s.landerExtra);
  const setPage = useApp((s) => s.setPage);
  return (
    <Card title="궤도 분석" tag={<span className="badge">준비 중</span>}>
      <div className="nodata">궤도 분석 기능은 아직 만들지 않았습니다.</div>
      <p className="small soft" style={{ margin: 0 }}>
        지금 입력: 건조 질량 <b className="mono">{ex.dry_mass_kg} kg</b> · 추진제 <b className="mono">{ex.prop_mass_kg} kg</b> · 추력 <b className="mono">{ex.thrust_n} N</b> · 비추력 <b className="mono">{ex.isp_s} s</b> (임시값)
      </p>
      <div className="row"><button className="btn sm" onClick={() => { useUi.getState().set({ condTab: 'lander' }); setPage('cond'); }}>01 임무 설정 › 착륙선 정보에서 바꾸기 →</button></div>
      <Help>착륙 궤적 설계·하강 장면은 이 도구의 범위 밖입니다(CLAUDE.md 2절 "하지 않을 것"). 이 화면에 무엇을 넣을지는 팀이 정합니다.</Help>
    </Card>
  );
}
