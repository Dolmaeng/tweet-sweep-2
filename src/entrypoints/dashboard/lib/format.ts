const intFormat = new Intl.NumberFormat('ko-KR');

export function fmtInt(n: number): string {
  return Number.isFinite(n) ? intFormat.format(n) : '∞';
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  return iso.slice(0, 10);
}

export function fmtDays(days: number): string {
  if (!Number.isFinite(days)) return '계산 불가';
  if (days <= 1) return '1일 이내';
  return `약 ${fmtInt(days)}일`;
}

/** RFC 4180 CSV. 셀에 쉼표·따옴표·줄바꿈이 있으면 인용 */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

export function downloadText(filename: string, text: string, mime = 'text/csv'): void {
  const blob = new Blob(['﻿' + text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
