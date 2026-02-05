import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  main: {
    build: {
      outDir: "out/main"
    }
  },
  preload: {
    build: {
      outDir: "out/preload"
    }
  },
  renderer: {
    root: "src/renderer",
    plugins: [react()],
    build: {
      outDir: "out/renderer"
    },
    resolve: {
      alias: {
        "@renderer": path.resolve(__dirname, "src/renderer"),
        "@shared": path.resolve(__dirname, "src/shared")
      }
    }
  }
});
