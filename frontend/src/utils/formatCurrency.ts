export const formatCurrency = (n: number) =>
  `${new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} บาท`;
