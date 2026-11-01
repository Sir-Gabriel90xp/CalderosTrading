import { defineConfig } from "vite";
export default defineConfig({
  esbuild: { jsx: "automatic" },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-dom/client"],
          cloud: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
