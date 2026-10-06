import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const core = { '@core': resolve(__dirname, 'src/core') }

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], resolve: { alias: core } },
  preload: { plugins: [externalizeDepsPlugin()], resolve: { alias: core } },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias: core },
    plugins: [react()]
  }
})
