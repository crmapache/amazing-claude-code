import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],

  // Пути должны быть относительными: статику отдаёт обработчик внутри плагина,
  // и корень там свой.
  base: './',

  build: {
    /**
     * Two pages, not one: the panel inside the IDE and the same interface opened in an ordinary
     * browser over the shell's local channel (see src/remote). The harness is deliberately not here -
     * it is a dev-only page, and the build guards against it reaching dist at all (see package.json).
     *
     * Naming any input at all switches Vite's default off, so index.html has to be named too.
     */
    rollupOptions: {
      input: {
        index: 'index.html',
        remote: 'remote.html',
      },
    },
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
