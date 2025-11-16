// vite.config.js
import react from '@vitejs/plugin-react';

export default {
  plugins: [react()],
  server: {
    allowedHosts: [
      '3613701d66c0.ngrok-free.app'
    ]
  }
}