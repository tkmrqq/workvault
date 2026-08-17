import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const API = env.VITE_API_URL || 'http://localhost:3000'
  const isElectron = process.env.BUILD_TARGET === 'electron'

  return {
    plugins: [vue()],
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