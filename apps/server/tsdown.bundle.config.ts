import { defineConfig } from 'tsdown'

/**
 * 发布用打包：把所有依赖内联进一个文件，
 * 这样 NAS 上只要有 node 就能跑，不需要 node_modules。
 */
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist-bundle',
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  dts: false,
  clean: true,
  minify: true,
  sourcemap: false,
  noExternal: [/.*/],
})
