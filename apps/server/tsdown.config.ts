import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  dts: false,
  clean: true,
  minify: true,
  sourcemap: false,
  alias: {
    '@/': fileURLToPath(new URL('./src/', import.meta.url)),
  },
})
