import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
export default defineConfig({
  base: '/apex-arena/app/',
  plugins: [react()],
  resolve: { alias: { '@apex/core': resolve(__dirname, '../../packages/core/src/index.ts') } },
  build: { outDir: resolve(__dirname, '../../app'), emptyOutDir: true },
})
