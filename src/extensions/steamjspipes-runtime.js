"use strict";

const { SEND_DELAY_MS, sleep } = require("../core/normalize");

function resolveSteamJSPipesTargetChannel(allChannels, steamCfg = {}) {
  const overrideWebhook = steamCfg.Webhook || steamCfg.webhook;
  const overrideThread = steamCfg.Thread ?? steamCfg.thread ?? null;

  if (overrideWebhook) {
    return {
      index: -1,
      channel: { Webhook: overrideWebhook, Thread: overrideThread },
    };
  }

  const rawIndex =
    steamCfg.ChannelIndex ??
    steamCfg.channelIndex ??
    steamCfg.TargetChannelIndex ??
    steamCfg.targetChannelIndex ??
    0;
  const index = Number(rawIndex);

  if (!Number.isInteger(index) || index < 0 || index >= allChannels.length) {
    console.error(
      `[SteamJSPipes] Invalid ChannelIndex (${rawIndex}). Available channels: 0..${Math.max(
        0,
        allChannels.length - 1
      )}`
    );
    return null;
  }

  const channel = allChannels[index];
  if (!channel || typeof channel !== "object" || !channel.Webhook) {
    console.error(`[SteamJSPipes] Channel at index ${index} has no Webhook.`);
    return null;
  }

  return {
    index,
    channel: {
      Webhook: channel.Webhook,
      Thread: channel.Thread ?? null,
    },
  };
}

function startSteamJSPipesIfEnabled({
  config,
  allChannels,
  cacheStore,
  sendMessage,
} = {}) {
  const steamCfg = config.SteamJSPipes || {};
  const enabled = Boolean(steamCfg.Enabled ?? steamCfg.enabled);
  if (!enabled) return null;

  let createSteamJSPipesBridge;
  try {
    ({ createSteamJSPipesBridge } = require("../steamjspipes"));
  } catch (err) {
    console.error(
      "[SteamJSPipes] Failed to load module. Install dependency with: npm install steam-user"
    );
    console.error("[SteamJSPipes] Details:", err.message);
    return null;
  }

  const target = resolveSteamJSPipesTargetChannel(allChannels, steamCfg);
  if (!target) {
    console.error("[SteamJSPipes] Not started (invalid routing target).");
    return null;
  }

  let sendQueue = Promise.resolve();
  const bridge = createSteamJSPipesBridge({
    rootConfig: config,
    cache: cacheStore.getState(),
    onEntry: async (entry) => {
      sendQueue = sendQueue
        .then(async () => {
          await sendMessage(target.channel.Webhook, target.channel.Thread, entry);
          await sleep(SEND_DELAY_MS);
        })
        .catch((err) => {
          console.error("[SteamJSPipes] Send queue error:", err.message);
        });
      await sendQueue;
    },
    onCacheChange: () => cacheStore.save(),
    onSystemEvent: (event) => {
      if (event?.Type === "UsersOnline") {
        if (typeof event.Users === "number") {
          console.log(`[SteamJSPipes] Users online: ${event.Users}`);
        }
        return;
      }
      if (event?.Type) {
        console.log(`[SteamJSPipes] Event: ${event.Type}`);
      }
    },
    logger: console,
  });

  const started = bridge.start();
  if (!started) return null;

  if (target.index >= 0) {
    console.log(
      `[SteamJSPipes] Started. Routing changelists to channel index ${target.index}.`
    );
  } else {
    console.log("[SteamJSPipes] Started. Routing changelists to explicit webhook.");
  }

  return bridge;
}

module.exports = {
  resolveSteamJSPipesTargetChannel,
  startSteamJSPipesIfEnabled,
};
