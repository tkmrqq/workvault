import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import fs from 'fs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const API = env.VITE_API_URL || 'http://localhost:3000'
  const isElectron = process.env.BUILD_TARGET === 'electron'

  /** Синхронизирует URL бэкенда в main-процессе Electron с VITE_API_URL рендерера */
  function electronServerUrlPlugin() {
    return {
      name: 'electron-server-url',
      closeBundle() {
        if (!isElectron) return
        const serverUrl = (env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '')
        fs.writeFileSync(
          resolve(__dirname, 'dist/server-url.json'),
          JSON.stringify({ serverUrl }, null, 2)
        )
      }
    }
  }

  return {
    plugins: [vue(), electronServerUrlPlugin()],
    base: isElectron ? './' : '/',   // ← единственное добавление
    resolve: { alias: { '@': resolve(__dirname, 'src') } },
    optimizeDeps: {
      // lucide-vue-next — огромный пакет с кучей именованных экспортов;
      // без явного include Vite пересобирает dep-кэш при каждой новой
      // иконке, которую раньше не встречал, и это ощущается как подвисание
      // при переходе на страницы, где появился новый импорт иконки.
      include: ['lucide-vue-next']
    },
    server: {
      port: 5173,
      proxy: {
        '/api':       { target: API, changeOrigin: true },
        '/admin':     { target: API, changeOrigin: true },
        '/uploads':   { target: API, changeOrigin: true },
        '/socket.io': { target: API, changeOrigin: true, ws: true }
      }
    }
  }
})