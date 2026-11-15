// 내보내기 (P1-41): CSV·보고서 텍스트. 화면 문구는 호출하는 쪽에서 strings 로 넘긴다.
export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? (Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : '') : v;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

export interface ReportSection {
  title: string;
  lines: string[];
}
export function reportText(title: string, sections: ReportSection[]): string {
  const out = [title, '='.repeat(Math.max(8, title.length)), ''];
  for (const s of sections) {
    out.push(`## ${s.title}`);
    for (const l of s.lines) out.push(`- ${l}`);
    out.push('');
  }
  return out.join('\n');
}
