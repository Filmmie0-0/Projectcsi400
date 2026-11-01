import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// backend อนุญาตเฉพาะ origin http://localhost:5173 (CORS_ORIGIN) — ถ้า port ถูกใช้อยู่ให้ error แทนการย้ายไป 5174
export default defineConfig({ plugins: [react()], server: { port: 5173, strictPort: true } });
