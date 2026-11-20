import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

const sharedSrc = fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url))
const serverSrc = fileURLToPath(new URL('./apps/server/src/', import.meta.url))
const sharedAlias = fileURLToPath(new URL('./packages/shared/src/', import.meta.url))

export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          alias: {
            '@/': serverSrc,
            '@ps5lb/shared': sharedSrc,
          },
        },
        test: {
          name: 'server',
          include: ['apps/server/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: {
          alias: {
            '@/': sharedAlias,
          },
        },
        test: {
          name: 'shared',
          include: ['packages/shared/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
})
