import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useData } from './state/data';
import { initFromUrl, syncUrl } from './state/store';
import './styles/base.css';
import { startI18n } from './i18n';

initFromUrl();
syncUrl();
useData.getState().loadAll();
startI18n();

/** 화면 예외가 앱 전체를 비우지 않게: 원인과 다시 불러오기 버튼을 보여 준다 */
class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error('화면 오류', err); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="nodata" style={{ margin: 16 }}>
        화면을 그리는 중 오류가 났습니다: {this.state.err.message}
        <div style={{ marginTop: 8 }}><button className="btn" onClick={() => { window.history.replaceState(null, '', window.location.pathname); window.location.reload(); }}>기본 상태로 다시 불러오기</button></div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
