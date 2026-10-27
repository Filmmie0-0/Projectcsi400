// API ส่งวันที่เป็น 'YYYY-MM-DD' หรือ 'YYYY-MM-DD HH:mm:ss' (เวลาไทย)
const parse = (s: string) => new Date(s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T'));

export const formatDate = (s?: string | null) =>
  s ? parse(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-';

export const formatDateTime = (s?: string | null) =>
  s ? parse(s).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
