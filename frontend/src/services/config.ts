// ยังไม่มี backend → ใช้ mock ในเบราว์เซอร์เป็นค่าเริ่มต้น; ตั้ง VITE_USE_MOCK=false เพื่อยิง API จริง
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
