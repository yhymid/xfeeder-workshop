"use strict";

const { sendMessage } = require("../message");
const { download } = require("../parsers/downloader");
const { getWithFallback, postWithFallback } = require("../client");
const { loadConfig } = require("../config-loader");
const { createCacheStore } = require("../core/cache-store");
const { collectConfiguredChannels, summarizeChannel, validateChannels } = require("../core/channel-config");
const { createFeedPipeline } = require("../core/feed-pipeline");
const { createChannelRunner } = require("./channel-runner");
const { startChannelQueue } = require("./runtime");
const { startSteamJSPipesIfEnabled } = require("../extensions/steamjspipes-runtime");

const { parseRSS } = require("../parsers/rss");
const { parseAtom } = require("../parsers/atom");
const { parseYouTube } = require("../parsers/youtube");
const { parseXML } = require("../parsers/xml");
const { parseJSON } = require("../parsers/json");
const { parseApiX } = require("../parsers/api_x");
const { parseFallback } = require("../parsers/fallback");
const { parseDiscord } = require("../parsers/discord");

function loadWorkshopParsers(config) {
  let workshopParsers = [];

  try {
    const { loadWorkshop } = require("../workshop/loader");
    const workshopEnabled = config.Workshop?.Enabled !== false;
    const workshopDir = config.Workshop?.Dir || "src/workshop";
    if (workshopEnabled) {
      const loaded = loadWorkshop(
        { get: getWithFallback, send: sendMessage, utils: {}, config },
        workshopDir
      );
      workshopParsers = loaded.parsers || [];
      console.log(`[Workshop] Parsers loaded: ${workshopParsers.length}`);
    } else {
      console.log("[Workshop] Disabled in config.");
    }
  } catch {
    console.log("[Workshop] Loader not available — skipping.");
  }

  return workshopParsers;
}

function logChannelSummary(channels) {
  const warnings = validateChannels(channels);
  for (const warning of warnings) {
    console.warn(warning);
  }

  for (const summary of (channels || []).map(summarizeChannel)) {
    const targets = [
      summary.hasWebhook ? "webhook" : null,
      summary.hasDiscord ? "discord" : null,
      summary.hasMatrix ? "matrix" : null,
    ].filter(Boolean).join("+") || "none";
    console.log(
      `[Config] ${summary.label}: feeds=${summary.feeds}, targets=${targets}, interval=${summary.interval}s, burst=${summary.burst}`
    );
  }
}

function createApp({ configPath = "./config.json", cachePath = "./cache.json" } = {}) {
  const config = loadConfig(configPath);
  const workshopParsers = loadWorkshopParsers(config);
  const cacheStore = createCacheStore(cachePath);

  const { fetchFeed } = createFeedPipeline({
    config,
    download,
    getWithFallback,
    postWithFallback,
    workshopParsers,
    builtInParsers: [
      parseYouTube,
      parseAtom,
      parseXML,
      parseJSON,
      parseApiX,
      parseRSS,
      parseFallback,
    ],
  });

  const { checkFeedsForChannel } = createChannelRunner({
    cacheStore,
    fetchFeed,
    parseDiscord,
    sendMessage,
  });

  const allChannels = collectConfiguredChannels(config);
  console.log(`[System] Channels to process: ${allChannels.length}`);
  logChannelSummary(allChannels);

  const steamBridge = startSteamJSPipesIfEnabled({
    config,
    allChannels,
    cacheStore,
    sendMessage,
  });

  const queueRuntime = startChannelQueue({
    allChannels,
    checkFeedsForChannel,
    steamBridge,
  });

  function shutdown({ exit = false } = {}) {
    if (queueRuntime && typeof queueRuntime.stop === "function") {
      queueRuntime.stop();
    }
    if (steamBridge && typeof steamBridge.stop === "function") {
      steamBridge.stop();
    }
    cacheStore.save();
    if (exit) {
      process.exit(0);
    }
  }

  return {
    config,
    allChannels,
    cacheStore,
    fetchFeed,
    checkFeedsForChannel,
    steamBridge,
    queueRuntime,
    shutdown,
  };
}

module.exports = {
  createApp,
};
