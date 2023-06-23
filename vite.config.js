import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  root: "src", // Set the root directory of your React components
  build: {
    outDir: "public", // Specify the output directory for the built files
    sourcemap: true, // Enable sourcemaps for better debugging
    minify: true, // Enable minification for production build
    brotliSize: false, // Disable Brotli size display
  },
});
