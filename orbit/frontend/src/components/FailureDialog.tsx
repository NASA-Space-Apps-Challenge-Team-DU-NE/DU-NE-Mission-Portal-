import { useEffect, useRef } from 'react';
import type { FailureGuidance } from '../services/failureGuidance';
import { Icon } from './Icon';

interface Props {
  guidance: FailureGuidance | null;
  open: boolean;
  onClose(): void;
  onEdit(): void;
}

export default function FailureDialog({ guidance, open, onClose, onEdit }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && guidance && !element.open) {
      element.showModal();
      title.current?.focus();
    } else if (!open && element.open) element.close();
  }, [open, guidance]);
  const close = () => { dialog.current?.close(); onClose(); };
  return <dialog ref={dialog} className="failure-dialog" role="alertdialog" aria-modal="true"
    aria-labelledby="failure-title" aria-describedby="failure-summary"
    onCancel={event => { event.preventDefault(); close(); }}>
    {guidance && <>
      <header className="failure-heading">
        <span className="failure-symbol"><Icon name="info" size={24}/></span>
        <div><span className="eyebrow">계산 결과 · 조건 확인 필요</span><h2 id="failure-title" ref={title} tabIndex={-1}>{guidance.title}</h2></div>
        <button type="button" className="icon-button" aria-label="경고창 닫기" onClick={close}><Icon name="close"/></button>
      </header>
      <div className="failure-content">
        <p id="failure-summary" className="failure-summary">{guidance.summary}</p>
        <div className="failure-issues">{guidance.issues.map((issue, index) => <section key={`${index}-${issue.title}`}>
          <h3><span>{String(index + 1).padStart(2, '0')}</span>{issue.title}</h3>
          <p>{issue.detail}</p>
          {issue.recommendations.length > 0 && <><h4>이렇게 조정해 보세요</h4><ul>{issue.recommendations.map((recommendation, i) => <li key={i}>{recommendation}</li>)}</ul></>}
        </section>)}</div>
        <p className="failure-note">설정을 조정한 뒤 다시 계산해 검증 결과를 확인하세요. 추천한 변경만으로 성공이 보장되지는 않습니다.</p>
        {guidance.technicalDetails && <details className="failure-technical"><summary>계산 진단 원문 보기 <Icon name="chevron" size={13}/></summary><pre>{guidance.technicalDetails}</pre></details>}
      </div>
      <footer className="failure-actions"><button type="button" className="failure-dismiss" onClick={close}>닫기</button><button type="button" className="failure-edit" onClick={() => { close(); onEdit(); }}>설정 확인하기 <Icon name="arrow" size={15}/></button></footer>
    </>}
  </dialog>;
}
