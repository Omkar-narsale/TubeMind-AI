import { build } from "vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function run() {
  try {
    console.log("1. Building pages (popup, options, sidepanel)...");
    await build({
      configFile: resolve(__dirname, "vite.config.ts"),
    });

    console.log("2. Building background service worker...");
    await build({
      configFile: false,
      resolve: {
        alias: {
          "@": resolve(__dirname, "src"),
        },
      },
      build: {
        emptyOutDir: false,
        outDir: "dist",
        lib: {
          entry: resolve(__dirname, "src/entrypoints/background/index.ts"),
          name: "background",
          formats: ["iife"],
          fileName: () => "background.js",
        },
        rollupOptions: {
          output: {
            extend: true,
          },
        },
      },
    });

    console.log("3. Building content script...");
    await build({
      configFile: false,
      resolve: {
        alias: {
          "@": resolve(__dirname, "src"),
        },
      },
      build: {
        emptyOutDir: false,
        outDir: "dist",
        lib: {
          entry: resolve(__dirname, "src/entrypoints/content/index.ts"),
          name: "content",
          formats: ["iife"],
          fileName: () => "content.js",
        },
        rollupOptions: {
          output: {
            extend: true,
          },
        },
      },
    });

    console.log("TubeMind AI Chrome Extension build completed successfully!");
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

run();
