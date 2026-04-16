#!/usr/bin/env node
"use strict";

const path = require("path");
const { loadConfig } = require("../config-loader");
const { createSteamJSPipesBridge } = require("./bridge");

function resolveConfigPath() {
  const arg = process.argv[2];
  if (!arg) {
    return path.resolve(process.cwd(), "config.json");
  }
  return path.resolve(process.cwd(), arg);
}

async function main() {
  const configPath = resolveConfigPath();
  const rootConfig = loadConfig(configPath);

  rootConfig.SteamJSPipes = rootConfig.SteamJSPipes || {};
  rootConfig.SteamJSPipes.Enabled = true;

  const cache = {};

  const bridge = createSteamJSPipesBridge({
    rootConfig,
    cache,
    onEntry: async (entry, rawEvent) => {
      const appCount = Object.keys(rawEvent.Apps || {}).length;
      const packageCount = Object.keys(rawEvent.Packages || {}).length;
      console.log(
        `[changelist] #${rawEvent.ChangeNumber} apps=${appCount} packages=${packageCount} ${entry.link}`
      );
    },
    onSystemEvent: (event) => {
      if (!event || !event.Type) {
        return;
      }
      if (event.Type === "UsersOnline") {
        console.log(`[status] UsersOnline=${event.Users}`);
        return;
      }
      console.log(`[status] ${event.Type}`);
    },
    onCacheChange: () => {
      // standalone mode keeps cache in-memory only
    },
    logger: console,
  });

  const started = bridge.start();
  if (!started) {
    console.error("[SteamJSPipes CLI] Not started. Check SteamJSPipes.Enabled in config.");
    process.exit(1);
  }

  console.log(`[SteamJSPipes CLI] Running with config: ${configPath}`);

  const shutdown = () => {
    console.log("[SteamJSPipes CLI] Stopping...");
    bridge.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[SteamJSPipes CLI] Fatal:", err?.message || err);
  process.exit(1);
});
