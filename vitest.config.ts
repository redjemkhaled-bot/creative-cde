import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@core': resolve(__dirname, 'src/core') } },
  test: { include: ['tests/**/*.test.ts'] }
})
