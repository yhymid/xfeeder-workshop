// main.js - XFeeder 2.1 Main Application
// Pipeline: Workshop → Modules → Axios → RSSParser → Error

const { createApp } = require("./src/app/bootstrap");

const app = createApp({
  configPath: "./config.json",
  cachePath: "./cache.json",
});

process.on("SIGINT", () => {
  console.log("\n[Shutdown] Saving cache and exiting...");
  app.shutdown({ exit: true });
});

process.on("uncaughtException", (error) => {
  console.error("[Critical Error]", error);
  app.shutdown();
});

process.on("unhandledRejection", (reason) => {
  console.error("[Unhandled Rejection]", reason);
  app.shutdown();
});

console.log(`🚀 XFeeder v${require("./package.json").version} started!`);
