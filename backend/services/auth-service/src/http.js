// ข้อมูลผู้ใช้มาจาก gateway (ตรวจ JWT แล้ว) ผ่าน header X-User-*
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const currentUser = (req) => ({
  id: Number(req.get('X-User-Id')),
  role: req.get('X-User-Role'),
  name: decodeURIComponent(req.get('X-User-Name') ?? ''),
});

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.get('X-User-Role'))) throw new HttpError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ใช้งานส่วนนี้');
  next();
};

export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ code: err.code, message: err.message });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ code: 'DUPLICATE', message: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว' });
  console.error(err);
  res.status(500).json({ code: 'INTERNAL', message: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง' });
}
