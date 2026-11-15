// 앱 틀: 검은 띠 | 지도 모드(달 전체) ↔ 계획 모드(왼쪽 단계 01→09 | 가운데 단계 화면 | 오른쪽 3D 달 + 현장 뷰)
import { lazy, Suspense, useEffect } from 'react';
import { Masthead, Overlays, PageFrame, Resizers, Sidebar } from './layout/Shell';
import { Rail } from './layout/Rail';
import { useData } from './state/data';
import { useGridRunner } from './state/gridRun';
import { useGlobeRunner } from './state/globeRuns';
import { useApp, type PageId } from './state/store';
import { useUi } from './state/ui';
import { useLang } from './i18n';
import { HOUR_MS } from './core/constants';
import { DEFAULT_SITE_ID } from './config';

const PAGES: Record<PageId, React.LazyExoticComponent<() => JSX.Element | null>> = {
  cond: lazy(() => import('./pages/Cond')),
  site: lazy(() => import('./pages/Site')),
  base: lazy(() => import('./pages/Base')),
  sim: lazy(() => import('./pages/Sim')),
  orbit: lazy(() => import('./pages/Orbit')),
  delay: lazy(() => import('./pages/Delay')),
  compare: lazy(() => import('./pages/Compare')),
  missions: lazy(() => import('./pages/Missions')),
  valid: lazy(() => import('./pages/Valid')),
};

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const s = useApp.getState();
      const step = e.shiftKey ? 24 * HOUR_MS : HOUR_MS;
      if (e.code === 'Space') { e.preventDefault(); s.togglePlay(); }
      else if (e.key === 'ArrowRight') s.setT(s.t + step);
      else if (e.key === 'ArrowLeft') s.setT(s.t - step);
      else if (e.key === 'c' || e.key === 'C') s.setMap({ colorOn: !s.colorOn });
      else if (e.key === 'f' || e.key === 'F') s.setFullscreen(!s.fullscreen);
      else if (e.key === 'Escape') { if (useUi.getState().gsFull) useUi.getState().set({ gsFull: false }); else if (useUi.getState().help) useUi.getState().set({ help: false }); else if (s.fullscreen) s.setFullscreen(false); else useUi.getState().set({ mode: 'explore' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** 데이터가 준비되면: 첫 착륙지·시각 기본값 (URL 로 정하지 않았을 때만) */
function useDefaults() {
  const sites = useData((d) => d.sites.items);
  const ephMeta = useData((d) => d.ephMeta);
  useEffect(() => {
    const s = useApp.getState();
    if (!s.siteRef && sites.length) {
      const first = sites.find((x) => x.id === DEFAULT_SITE_ID) ?? sites.find((x) => x.terrain === 'site') ?? sites[0];
      s.setSite({ kind: 'catalog', id: first.id });
    }
    if (ephMeta && !new URLSearchParams(window.location.search).get('t')) {
      const start = Date.parse(ephMeta.start_utc);
      const end = start + (ephMeta.count - 1) * ephMeta.step_h * HOUR_MS;
      if (s.landing < start || s.landing > end) { s.setLanding(start); s.setT(start); }
    }
  }, [sites, ephMeta]);
}

export default function App() {
  const page = useApp((s) => s.page);
  const P = PAGES[page];
  const mode = useUi((u) => u.mode);
  const lang = useLang((l) => l.lang); // 언어를 바꾸면 본문을 다시 그린다 (캔버스 글자 포함)
  const sideCollapsed = useUi((u) => u.sideCollapsed);
  const sideW = useUi((u) => u.sideW);
  const railW = useUi((u) => u.railW);
  const layoutVars = {
    ...(sideCollapsed ? { '--side-w': '64px' } : sideW ? { '--side-w': `${sideW}px` } : {}),
    ...(railW ? { '--rail-w': `${railW}px` } : {}),
  } as React.CSSProperties;
  useShortcuts();
  useDefaults();
  useGridRunner();
  useGlobeRunner();
  return (
    <>
      <Masthead />
      <div className={`app mode-${mode}${sideCollapsed ? ' side-collapsed' : ''}`} key={lang} style={layoutVars}>
        <Sidebar />
        <PageFrame>
          <Suspense fallback={<div className="muted">불러오는 중…</div>}>
            <P />
          </Suspense>
        </PageFrame>
        <Rail />
        <Resizers />
      </div>
      <Overlays />
    </>
  );
}
