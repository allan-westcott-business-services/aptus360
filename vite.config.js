import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        /* React changes rarely and Supabase almost never, so splitting them
           out means a normal code change invalidates a much smaller file
           for returning users. */
        /* React is in the shell and needed immediately. Supabase is not
           listed here any more: it is imported dynamically, so Rollup
           gives it a chunk of its own and loads it after first paint
           rather than before. Naming it here would pull it back into the
           initial graph. */
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
