import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  alias: {
    '@/': fileURLToPath(new URL('./src/', import.meta.url)),
  },
})
