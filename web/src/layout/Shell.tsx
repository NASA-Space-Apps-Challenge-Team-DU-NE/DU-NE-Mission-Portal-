// 앱 틀: 검은 띠(로고·화면 이동) | 지도 모드(달이 가운데 전체) ↔ 계획 모드(단계 | 단계 화면 | 오른쪽 달 + 현장 뷰)
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HOUR_MS } from '../core/constants';
import { reportText, toCsv } from '../core/export';
import { gridLabel, Toast, toast, utc, pct, LayerPopover } from '../components/kit';
import { useData } from '../state/data';
import { useSiteWarnings, useEval, usePower, useSim } from '../state/derived';
import { useGridRun } from '../state/gridRun';
import { useResolvedSite } from '../state/hooks';
import { useApp, type PageId } from '../state/store';
import { playClock } from '../state/playClock';
import { PROFILE_UI, STEPS, useUi } from '../state/ui';
import { HOMEPAGE_URL, POWER_KINDS } from '../config';
import { useLang } from '../i18n';
import { t } from '../strings';


const toInput = (ms: number) => new Date(ms).toISOString().slice(0, 16);
const fromInput = (s: string) => Date.parse(`${s}:00Z`);

function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 처음부터 다시: 누르면 확인을 한 번 더 묻고, 확인하면 주소의 설정을 지우고 새로 연다.
 *  (화면 언어와 칸 너비·접기는 그대로 둔다) */
function StartOver() {
  const [ask, setAsk] = useState(false);
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!ask) return;
    yes.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setAsk(false); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [ask]);
  return (
    <>
      <button type="button" className="btn sm so-btn" onClick={() => setAsk(true)}>처음부터 다시</button>
      {ask ? (
        <div className="confirm-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) setAsk(false); }}>
          <div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="so-h" aria-describedby="so-p">
            <div className="confirm-h" id="so-h">처음부터 다시 시작할까요?</div>
            <p id="so-p">정한 조건, 착륙지, 착륙 날짜, 기지 배치, 비교 목록, 추가한 지상국이 모두 지워지고 처음 화면으로 돌아갑니다. 되돌릴 수 없습니다.</p>
            <div className="confirm-b">
              <button type="button" className="btn" onClick={() => setAsk(false)}>취소</button>
              <button type="button" className="btn danger" ref={yes} onClick={() => { window.location.href = window.location.pathname; }}>처음부터 다시</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** 맨 위 검은 띠: 팀 로고(홈페이지와 같은 크기·위치) · 화면 이동 · 데이터 상태 · 내보내기 */
export function Masthead() {
  const app = useApp();
  const status = useData((d) => d.status);
  const unverified = useData((d) => d.unverified);
  const reasons = useData((d) => d.missingReasons);
  const gridApprox = useData((d) => d.gridApprox);
  const res = useGridRun((g) => g.result);
  const gridError = useGridRun((g) => g.error);
  const retryGrid = useGridRun((g) => g.retry);
  const rs = useResolvedSite();
  const ev = useEval();
  const warns = useSiteWarnings();
  const ui = useUi();

  const csv = () => {
    if (!res) return;
    const rows = res.top.map((c, i) => [i + 1, `cell_${c.cell}`, c.lat_deg.toFixed(4), c.lon_deg.toFixed(4), c.score.toFixed(3), res.dyn.illum_mission[c.cell].toFixed(3), res.dyn.comm_mission[c.cell].toFixed(3), res.dyn.dark_h[c.cell].toFixed(0)]);
    download('luna-nav-ranking.csv', toCsv(['rank', 'id', 'lat_deg', 'lon_deg', 'score_0_1', 'illum_mission', 'comm_mission', 'longest_dark_h'], rows), 'text/csv');
  };
  const report = async () => {
    const s = rs?.site;
    const txt = reportText('착륙지 평가 보고서', [
      { title: '조건', lines: [`- 프로파일: ${PROFILE_UI[app.profile].name}`, `- 착륙 시각: ${utc(app.landing)} UTC`, `- 임무 기간: ${app.duration_h} h · 통신 여유각 ${app.margin_deg}°`, `- 필수 조건: ${JSON.stringify(app.filters)}`] },
      { title: '선택 착륙지', lines: s && ev ? [`- ${s.name} (${s.lat_deg.toFixed(3)}, ${s.lon_deg.toFixed(3)}) · ${rs?.terrain === 'site' ? '지형 반영' : rs?.terrain === 'grid' ? `격자 근사${rs.gridRegion ? ` (${gridLabel(rs.gridRegion, rs.gridKm)})` : ''}` : '지형 미반영'}`, `- 점수 ${Math.round(ev.score.total)} · ${ev.score.meets_requirements ? '요구 조건 충족' : '요건 미달'} · 일조율 ${pct(ev.summary.illum_frac)} · 교신율 ${pct(ev.summary.comm_frac)} · 최장 암흑 ${Math.round(ev.summary.longest_dark_h)} h`] : ['- 없음'] },
      { title: '상위 후보', lines: (res?.top ?? []).slice(0, 5).map((c, i) => `${i + 1}. cell_${c.cell} (${c.lat_deg.toFixed(3)}, ${c.lon_deg.toFixed(3)}) ${Math.round(c.score * 100)}`) },
      { title: '경고', lines: [...warns.map((w) => `- 경고: ${w.target_name} (${w.distance_km.toFixed(1)} km)`), unverified ? '- 일부 수치 미검증' : ''] },
      { title: '', lines: ['점수는 후보 간 상대 비교용 지표이며 확률이 아님.'] },
    ]);
    try { await navigator.clipboard.writeText(txt); toast('보고서를 복사했습니다'); } catch { download('luna-nav-report.txt', txt, 'text/plain'); }
  };
  const go = (page?: PageId) => { if (page) app.setPage(page); ui.set({ mode: 'plan' }); };
  const plan = ui.mode === 'plan';
  const { lang, setLang } = useLang();
  const on = (p: PageId | null) => (p === null ? !plan : plan && app.page === p);

  return (
    <header className="mast">
      <a className="logo" href="./" aria-label="DU:NE 임무 포털 처음으로" onClick={(e) => { e.preventDefault(); ui.set({ mode: 'explore' }); }}>
        <img src="brand/dune-logo.png" alt="DU:NE" width={221} height={80} />
      </a>
      <nav className="mnav" aria-label="화면">
        <button aria-current={on(null)} onClick={() => ui.set({ mode: 'explore' })}>지도</button>
        <button aria-current={plan && !['compare', 'valid'].includes(app.page)} onClick={() => go(['compare', 'valid'].includes(app.page) ? 'cond' : undefined)}>계획</button>
        <button aria-current={on('compare')} onClick={() => go('compare')}>비교</button>
        <button aria-current={on('valid')} onClick={() => go('valid')}>검증</button>
        {HOMEPAGE_URL ? <a href={HOMEPAGE_URL}>학습 자료 · 출처 ↗</a> : null}
      </nav>
      <div className="macts">
        {gridError ? <button className="btn" title={gridError} onClick={retryGrid}>{t('grid.retry')}</button> : null}
        <span className={`badge ${status === 'ready' ? 'ok' : 'warn'}`} title={reasons.join('\n') || '파이프라인 산출물(web/public/data)을 모두 읽었을 때'}>● {status === 'ready' ? (gridApprox ? '데이터 일부 근사' : '데이터 준비됨') : status === 'loading' || status === 'idle' ? '불러오는 중' : status === 'degraded' ? `일부 자료 없음 (${reasons.length})` : status === 'failed' ? '불러오기 실패' : '자료 없음'}</span>
        <StartOver />
        <button className="btn sm" onClick={report}>보고서 복사</button>
        <button className="btn sm mast-csv" onClick={csv} disabled={!res}>순위 CSV</button>
        <button className="ibtn" aria-label="도움말" onClick={() => ui.set({ help: true })}>?</button>
      </div>
      <div className="lang" aria-label="Language">
        <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
        <span aria-hidden="true">/</span>
        <button aria-pressed={lang === 'ko'} onClick={() => setLang('ko')}>KR</button>
      </div>
    </header>
  );
}

/** 시간 막대: 착륙 시각 · 재생 · 보는 시각. 달 지도 아래에 붙는다 (어느 모드에서나 보임) */
export function TimeBar() {
  const app = useApp();
  const span = Math.max(720, app.duration_h);
  const rel = (app.t - app.landing) / HOUR_MS;

  // 재생: 3D 화면은 매 프레임 부드럽게(playClock), 계산용 시각(store t)은 220 ms 마다 그 값으로 맞춘다.
  // 빠르기는 예전과 같다 (220 ms 에 speed 시간). 끝나면 착륙 시각으로 돌아간다.
  useEffect(() => {
    if (!app.playing) { playClock.playing = false; return; }
    playClock.t = useApp.getState().t; playClock.playing = true;
    let raf = 0, last = performance.now(), sync = last;
    const tick = (now: number) => {
      const st = useApp.getState();
      playClock.t += ((now - last) / 220) * st.speed_h * HOUR_MS; last = now;
      if (playClock.t > st.landing + Math.max(720, st.duration_h) * HOUR_MS) playClock.t = st.landing;
      if (now - sync >= 220) { sync = now; useApp.setState({ t: Math.round(playClock.t / 60000) * 60000 }); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); playClock.playing = false; };
  }, [app.playing]);

  return (
    <div className="timebar">
      <button className="ibtn pri" aria-label="재생" title="재생 (스페이스)" onClick={app.togglePlay}>{app.playing ? '❚❚' : '▶'}</button>
      <div className="tgrp">
        <label htmlFor="landing">착륙</label>
        <input type="datetime-local" className="field mono" id="landing" step={3600} value={toInput(app.landing)} onChange={(e) => { const v = fromInput(e.target.value); if (Number.isFinite(v)) { app.setLanding(v); app.setT(v); toast('착륙 시각을 바꿨습니다'); } }} />
        <span className="tiny muted mono">UTC</span>
      </div>
      <div className="tslide">
        <div className="tl"><span>보는 시각 <output>{utc(app.t)} UTC</output></span><span className="mono">착륙 {rel >= 0 ? '+' : '−'}{Math.floor(Math.abs(rel) / 24)}일 {Math.round(Math.abs(rel) % 24)}시간</span></div>
        <input type="range" min={-24} max={span} step={1} value={Math.max(-24, Math.min(span, rel))} aria-label="보는 시각 (착륙 기준 시간)" onChange={(e) => app.setT(app.landing + Number(e.target.value) * HOUR_MS)} />
      </div>
      <div className="seg" aria-label="재생 속도">
        {[[1, '1h'], [6, '6h'], [24, '1일']].map(([v, l]) => <button key={v} aria-pressed={app.speed_h === v} onClick={() => app.setSpeed(v as number)}>{l}</button>)}
      </div>
      <button className="btn sm" title="실제 현재 시각" onClick={() => app.setT(Math.floor(Date.now() / HOUR_MS) * HOUR_MS)}>지금</button>
      <button className="btn sm" onClick={() => app.setT(app.landing)}>착륙 시각으로</button>
    </div>
  );
}

export function Sidebar() {
  const app = useApp();
  const rs = useResolvedSite();
  const ev = useEval();
  const sim = useSim();
  const ui = useUi();
  const warns = useSiteWarnings();
  const pw = usePower(ui.demand_kw, ui.eff);
  const missions = useData((d) => d.missions.items);
  const landers = useData((d) => d.landers.items);
  const lander = landers.find((l) => l.id === app.landerId) ?? landers[0];
  const VN = { met: '요구 조건 충족', partial: '부분 충족', not_met: '미충족' } as const;
  const summary = (id: PageId): string => {
    switch (id) {
      case 'cond': return `${PROFILE_UI[app.profile].name} · ${app.duration_h} h · ${POWER_KINDS[app.powerSource.kind].name}`;
      case 'site': return `${rs ? rs.site.name : '아직 안 고름'} · ${utc(app.landing).slice(5)}`;
      case 'orbit': return '준비 중';
      case 'base': return ui.baseOff ? '기지 없음 · 착륙지 = 기지' : `기지 ${app.bases.length}개${warns.length ? ` · 경고 ${warns.length}` : ''}`;
      case 'sim': return [sim ? VN[sim.sim.verdict] : null, pw?.plan.feasible ? `패널 ${Math.round(pw.plan.panel_area_m2)} m²` : null, ev ? `교신 ${pct(ev.summary.comm_frac)}` : null].filter(Boolean).join(' · ') || '—';
      case 'delay': return `+${app.shift_days}일 지연 가정`;
      case 'compare': return `비교 ${app.scenarios.length}/4`;
      case 'missions': return `미션 ${missions.length}개`;
      case 'valid': return '천체력 · 일조율 · 재현';
    }
  };
  const dot = (id: PageId) => {
    if (id === 'base' && warns.length) return 'warn';
    if (id === 'sim') return sim && sim.sim.verdict !== 'met' ? 'warn' : 'ok';
    if (id === 'site' && ev && !ev.score.meets_requirements) return 'warn';
    return '';
  };
  let g = '';
  return (
    <nav className={`side${ui.sideCollapsed ? ' collapsed' : ''}`} aria-label="단계">
      <button type="button" className="sidetog" aria-expanded={!ui.sideCollapsed} title={ui.sideCollapsed ? '단계 설명 펴기' : '단계 설명 접기'} onClick={() => ui.set({ sideCollapsed: !ui.sideCollapsed })}>
        {ui.sideCollapsed ? '»' : '« 접기'}
      </button>
      <div className="scroll">
        {STEPS.map((st) => {
          const head = st.g !== g ? <div className="sgrp" key={`g${st.g}`}>{st.g}</div> : null;
          g = st.g;
          const s = summary(st.id);
          return [
            head,
            <button key={st.id} className={`step ${app.visited.includes(st.id) && st.id !== app.page ? 'done' : ''}`} aria-current={st.id === app.page} title={ui.sideCollapsed ? `${st.n} ${st.t}` : undefined} onClick={() => app.setPage(st.id)}>
              <span className="n">{st.n}</span><span className="t">{st.t}</span><span className={`dot ${dot(st.id)}`} /><span className="s" title={s}>{s}</span>
            </button>,
          ];
        })}
      </div>
      <div className="plan">
        <h4>지금 계획</h4>
        <span>착륙지</span><b>{rs?.site.name ?? '—'}</b>
        <span>착륙</span><b className="mono">{utc(app.landing)}</b>
        <span>기간</span><b>{app.duration_h} h</b>
        <span>착륙선</span><b title={lander?.name}>{lander?.name.split(' (')[0] ?? '—'}</b>
        <span>점수</span><b>{ev ? `${Math.round(ev.score.total)}${ev.score.meets_requirements ? '' : ' · 요건 미달'}` : '—'}</b>
      </div>
    </nav>
  );
}

/** 계획 모드 세 칸 사이 경계: 끌어서 너비 조절, 두 번 누르면 기본값 */
export function Resizers() {
  const mode = useUi((u) => u.mode);
  const ui = useUi();
  if (mode !== 'plan') return null;
  const start = (which: 'side' | 'rail') => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const app = (e.currentTarget.parentElement as HTMLElement);
    const box = app.getBoundingClientRect();
    const side = app.querySelector('.side') as HTMLElement | null;
    const rail = app.querySelector('.rail') as HTMLElement | null;
    app.classList.add('resizing');
    const MID_MIN = 420;
    const move = (ev: PointerEvent) => {
      const st = useUi.getState();
      if (which === 'side') {
        const x = ev.clientX - box.left;
        const railW = rail?.getBoundingClientRect().width ?? 360;
        if (x < 120) { if (!st.sideCollapsed) st.set({ sideCollapsed: true }); return; }
        const w = Math.round(Math.max(170, Math.min(420, x, box.width - railW - MID_MIN)));
        st.set({ sideCollapsed: false, sideW: w });
      } else {
        const sideW = side?.getBoundingClientRect().width ?? 236;
        const w = Math.round(Math.max(300, Math.min(box.right - ev.clientX, box.width - sideW - MID_MIN, box.width * 0.6)));
        st.set({ railW: w });
      }
    };
    const up = () => {
      app.classList.remove('resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.dispatchEvent(new Event('resize')); // 캔버스·3D 크기 다시 맞춤
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <>
      <div className="rsz rsz-side" role="separator" aria-orientation="vertical" aria-label="단계 목록 너비" title="끌어서 너비 조절 · 두 번 누르면 기본값" onPointerDown={start('side')} onDoubleClick={() => ui.set({ sideW: 0, sideCollapsed: false })} />
      <div className="rsz rsz-rail" role="separator" aria-orientation="vertical" aria-label="달 영역 너비" title="끌어서 너비 조절 · 두 번 누르면 기본값" onPointerDown={start('rail')} onDoubleClick={() => ui.set({ railW: 0 })} />
    </>
  );
}

export function PageFrame({ children }: { children: ReactNode }) {
  const page = useApp((s) => s.page);
  const setPage = useApp((s) => s.setPage);
  const i = STEPS.findIndex((s) => s.id === page);
  const st = STEPS[i], prev = STEPS[i - 1], next = STEPS[i + 1];
  return (
    <main className="dash">
      <div className="phead"><div><button className="back" onClick={() => useUi.getState().set({ mode: 'explore' })}>← 지도로</button><div className="k">STEP {st.n} / {STEPS.length} · {st.g.split(' · ')[1]}</div><h1>{st.t}</h1><p>{st.d}</p></div></div>
      <div className="pbody" key={page}>{children}</div>
      <div className="pfoot">
        {prev ? <button className="btn" onClick={() => setPage(prev.id)}>← {prev.n} {prev.t}</button> : <span />}
        {next ? <button className="btn pri nx" onClick={() => setPage(next.id)}>다음: {next.n} {next.t} →</button> : <span className="small muted" style={{ alignSelf: 'center' }}>마지막 단계입니다</span>}
      </div>
    </main>
  );
}

export function HelpModal() {
  const help = useUi((u) => u.help);
  const set = useUi((u) => u.set);
  if (!help) return null;
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) set({ help: false }); }}>
      <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="helpT">
        <div className="row" style={{ justifyContent: 'space-between' }}><h2 id="helpT" style={{ margin: 0, fontSize: 17 }}>사용법</h2><button className="ibtn" aria-label="닫기" onClick={() => set({ help: false })}>✕</button></div>
        <ol>
          <li>왼쪽 <b>단계</b>를 01부터 차례로 누릅니다. 각 단계 아래 회색 글씨는 지금 정해진 값입니다.</li>
          <li><b>01 임무 설정</b>, <b>02 착륙지·날짜</b>, <b>03 기지</b>를 정하면 <b>04 임무 분석</b>(전력·통신 탭 포함)이 그 값으로 계산됩니다.</li>
          <li>오른쪽 <b>3D 달</b>과 <b>현장 뷰</b>는 어느 단계에서나 같은 착륙지·시각을 보여 줍니다.</li>
          <li>착륙 시각을 바꾸면 3D 달·현장 뷰가 그 시각으로 옮겨 갑니다. 그래프를 누르거나 <span className="kbd">←</span><span className="kbd">→</span>로 보는 시각을 움직일 수 있습니다.</li>
          <li>지도 색은 <b>레이어</b> 버튼에서 고릅니다. 각 레이어 옆에 무엇을 뜻하는지, 초록이 좋은 쪽인지 적혀 있습니다.</li>
        </ol>
        <p className="small muted" style={{ margin: 0 }}>단축키: <span className="kbd">Space</span> 재생 · <span className="kbd">←</span><span className="kbd">→</span> 1시간 · <span className="kbd">Shift</span>+<span className="kbd">←</span><span className="kbd">→</span> 1일 · <span className="kbd">C</span> 지도 색 · <span className="kbd">F</span> 3D 전체화면 · <span className="kbd">Esc</span> 닫기</p>
        <p className="small muted" style={{ margin: 0 }}>점수는 후보 간 상대 비교용 지표이며 확률이 아닙니다.</p>
      </div>
    </div>
  );
}

export function Overlays() {
  return (<><LayerPopover /><HelpModal /><Toast /></>);
}
