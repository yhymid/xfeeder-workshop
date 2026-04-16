"use strict";

const { resolveSteamJSPipesConfig } = require("./config");
const { createSteamJSPipesRuntime } = require("./core");
const {
  DEFAULT_CACHE_BUCKET,
  ensureCacheBucket,
  hasSeenKey,
  markSeenKey,
  buildChangelistCacheKey,
} = require("./cache");
const { applyAppWhitelist, isChangelistEvent } = require("./filter");
const { mapChangelistEventToEntry } = require("./mapper");

function createSteamJSPipesBridge({
  rootConfig,
  cache,
  onEntry,
  onCacheChange,
  onSystemEvent,
  logger = console,
  cacheBucket = DEFAULT_CACHE_BUCKET,
} = {}) {
  if (!cache || typeof cache !== "object") {
    throw new Error("SteamJSPipes requires shared cache object");
  }
  if (typeof onEntry !== "function") {
    throw new Error("SteamJSPipes requires onEntry(entry, rawEvent) callback");
  }

  const config = resolveSteamJSPipesConfig(rootConfig);
  ensureCacheBucket(cache, cacheBucket);

  const stats = {
    changelistsReceived: 0,
    changelistsFiltered: 0,
    changelistsSkipped: 0,
    changelistsSent: 0,
    systemEvents: 0,
    errors: 0,
  };

  const runtime = createSteamJSPipesRuntime({
    rootConfig,
    config,
    logger,
    onEvent: async (event) => {
      if (!event || typeof event !== "object") {
        return;
      }

      if (!isChangelistEvent(event)) {
        stats.systemEvents += 1;

        if (config.statusEvents) {
          if (event.Type === "UsersOnline") {
            logger.log?.(`[SteamJSPipes] Users online: ${event.Users}`);
          } else {
            logger.log?.(`[SteamJSPipes] Event: ${event.Type}`);
          }
        }

        if (event.Type === "UsersOnline" && !config.usersOnlineEvents) {
          return;
        }

        onSystemEvent?.(event);
        return;
      }

      stats.changelistsReceived += 1;

      if (!applyAppWhitelist(event, config.whitelistApps)) {
        stats.changelistsFiltered += 1;
        return;
      }

      const cacheKey = buildChangelistCacheKey(event.ChangeNumber);
      if (hasSeenKey(cache, cacheKey, cacheBucket)) {
        stats.changelistsSkipped += 1;
        return;
      }

      const entry = mapChangelistEventToEntry(event, config);
      if (!entry) {
        stats.errors += 1;
        return;
      }

      await onEntry(entry, event);

      const changed = markSeenKey(cache, cacheKey, cacheBucket, config.cacheLimit);
      if (changed) {
        onCacheChange?.();
      }

      stats.changelistsSent += 1;

      if (config.statusEvents) {
        logger.log?.(`[SteamJSPipes] Sent changelist #${event.ChangeNumber}`);
      }
    },
    onStateChange: (state) => {
      if (!config.statusEvents || !state || !state.type) {
        return;
      }

      if (state.type === "connecting") {
        logger.log?.("[SteamJSPipes] Connecting to Steam...");
        return;
      }
      if (state.type === "open") {
        logger.log?.("[SteamJSPipes] Connected to Steam.");
        return;
      }
      if (state.type === "reconnect-scheduled") {
        logger.warn?.(
          `[SteamJSPipes] Reconnect attempt #${state.attempt} in ${state.delayMs}ms`
        );
        return;
      }
      if (state.type === "stopped") {
        logger.warn?.(`[SteamJSPipes] Runtime stopped (${state.reason || "unknown"}).`);
      }
    },
    onError: (err) => {
      stats.errors += 1;
      logger.error?.("[SteamJSPipes]", err?.message || err);
    },
  });

  return {
    config,
    start() {
      if (!config.enabled) {
        logger.log?.("[SteamJSPipes] Disabled in config.");
        return false;
      }
      runtime.start();
      return true;
    },
    stop() {
      runtime.stop();
    },
    getStats() {
      return {
        ...stats,
        runtime: runtime.getStats(),
      };
    },
  };
}

module.exports = {
  createSteamJSPipesBridge,
};
