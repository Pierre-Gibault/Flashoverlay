import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

const rootDirectory = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  root: rootDirectory,
  build: {
    rollupOptions: {
      input: {
        control: fileURLToPath(new URL("index.html", import.meta.url)),
        overlay: fileURLToPath(new URL("overlay.html", import.meta.url)),
      },
    },
  },
})
