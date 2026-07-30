import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],

  // Пути должны быть относительными: статику отдаёт обработчик внутри плагина,
  // и корень там свой.
  base: './',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // В архив плагина карты кода не кладём: мегабайт на каждую сборку, а смотреть
    // их всё равно удобнее на dev-сервере, где они есть всегда.
    sourcemap: false,
  },

  server: {
    port: 5173,
    strictPort: true,
  },
})
