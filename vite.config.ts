import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { pdfAssets } from './plugins/pdfAssets.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.BACKEND_URL || 'http://localhost:8080'

  return {
    plugins: [react(), pdfAssets()],
    // Заранее собираем ленивые движки просмотра: первое открытие DOCX не должно вызывать
    // перезагрузку Vite из-за обнаружения зависимостей и терять выбранные локально файлы.
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
