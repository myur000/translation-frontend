import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { pdfAssets } from './plugins/pdfAssets.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.BACKEND_URL || 'http://localhost:8080'

  return {
    plugins: [react(), pdfAssets()],
    // Prebundle lazy viewer engines up front: first opening DOCX must not cause
    // a Vite dependency-discovery reload and discard locally selected files.
    optimizeDeps: { include: ['pdfjs-dist', 'mammoth', 'dompurify'] },
    server: {
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          headers: {
            Origin: backendUrl,
          },
        },
      },
    },
  }
})
