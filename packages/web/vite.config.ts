import path from "path"
import { fileURLToPath } from "url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Check if running in Tauri mode
const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  // https://tauri.app/v1/guides/getting-started/setup/vite
  clearScreen: false,
  server: {
    // Tauri expects a fixed port, fail if that port is not available
    strictPort: true,
    // Allow access from Tauri
    host: isTauri ? '0.0.0.0' : 'localhost',
    port: 5173,
    // Proxy is only needed in web mode (not Tauri)
    proxy: isTauri ? undefined : {
      '/api': {
        target: 'http://localhost:1738',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:1738',
        ws: true,
      },
    },
  },
  // Env prefix for Tauri
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS/Linux
    target: isTauri ? ['es2021', 'chrome100', 'safari15'] : 'esnext',
    // Don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
