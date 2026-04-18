"use strict";

const FEED_FIELD_NAMES = ["RSS", "Feeds", "URLs", "Sources"];

function normalizeFeedList(value) {
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveChannelFeeds(channel) {
  const merged = [];
  const seen = new Set();

  for (const fieldName of FEED_FIELD_NAMES) {
    for (const entry of normalizeFeedList(channel[fieldName])) {
      if (seen.has(entry)) continue;
      seen.add(entry);
      merged.push(entry);
    }
  }

  return merged;
}

function normalizeThreadValue(value) {
  if (value === null || value === undefined || value === "" || value === "null") {
    return null;
  }
  return String(value);
}

function normalizeRequestSend(value, fallback = 5) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.floor(number);
}

function normalizeTimeChecker(value, fallback = 30) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.floor(number);
}

function normalizeDiscordConfig(discordConfig) {
  if (!discordConfig || typeof discordConfig !== "object") return null;

  const normalized = {
    ...discordConfig,
  };

  if (normalized.Webhook) normalized.Webhook = String(normalized.Webhook).trim();
  normalized.Thread = normalizeThreadValue(normalized.Thread);
  normalized.ChannelIDs = Array.isArray(normalized.ChannelIDs)
    ? normalized.ChannelIDs.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : normalized.ChannelIDs;

  return normalized;
}

function cloneDefaults(defaults) {
  if (!defaults || typeof defaults !== "object") return {};
  return {
    ...defaults,
    Discord: defaults.Discord && typeof defaults.Discord === "object" ? { ...defaults.Discord } : defaults.Discord,
    Matrix: defaults.Matrix && typeof defaults.Matrix === "object" ? { ...defaults.Matrix } : defaults.Matrix,
  };
}

function buildChannelFromShorthand(input, defaults) {
  if (typeof input === "string") {
    return {
      ...cloneDefaults(defaults),
      Feeds: [input],
    };
  }

  if (Array.isArray(input)) {
    return {
      ...cloneDefaults(defaults),
      Feeds: input,
    };
  }

  if (input && typeof input === "object") {
    const merged = {
      ...cloneDefaults(defaults),
      ...input,
    };

    if (defaults?.Discord || input.Discord) {
      merged.Discord = {
        ...(defaults?.Discord && typeof defaults.Discord === "object" ? defaults.Discord : {}),
        ...(input.Discord && typeof input.Discord === "object" ? input.Discord : {}),
      };
    }

    if (defaults?.Matrix || input.Matrix) {
      merged.Matrix = {
        ...(defaults?.Matrix && typeof defaults.Matrix === "object" ? defaults.Matrix : {}),
        ...(input.Matrix && typeof input.Matrix === "object" ? input.Matrix : {}),
      };
    }

    return merged;
  }

  return null;
}

function normalizeChannel(channel, index) {
  const normalized = {
    index,
    name: channel.__channelName || null,
    sourceKey: channel.__sourceKey || null,
    Webhook: typeof channel.Webhook === "string" ? channel.Webhook.trim() : "",
    Thread: normalizeThreadValue(channel.Thread),
    RSS: resolveChannelFeeds(channel),
    TimeChecker: normalizeTimeChecker(channel.TimeChecker, 30),
    RequestSend: normalizeRequestSend(channel.RequestSend, 5),
    Discord: normalizeDiscordConfig(channel.Discord),
    Matrix: channel.Matrix && typeof channel.Matrix === "object" ? { ...channel.Matrix } : null,
    raw: channel,
  };

  return normalized;
}

function collectConfiguredChannels(config) {
  const result = [];
  const channelDefaults =
    (config && typeof config.ChannelDefaults === "object" && config.ChannelDefaults) ||
    (config && typeof config.DefaultChannel === "object" && config.DefaultChannel) ||
    {};

  for (const [key, value] of Object.entries(config || {})) {
    if (!key.toLowerCase().startsWith("channels")) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const channel of value) {
        const built = buildChannelFromShorthand(channel, channelDefaults);
        if (!built || typeof built !== "object") continue;
        result.push({
          ...built,
          __sourceKey: key,
        });
      }
      continue;
    }

    if (value && typeof value === "object") {
      for (const [channelName, channelValue] of Object.entries(value)) {
        const built = buildChannelFromShorthand(channelValue, channelDefaults);
        if (!built || typeof built !== "object") continue;
        result.push({
          ...built,
          __sourceKey: key,
          __channelName: channelName,
        });
      }
    }
  }

  return result
    .map((channel, index) => normalizeChannel(channel, index))
    .filter((channel) => channel && typeof channel === "object");
}

module.exports = {
  collectConfiguredChannels,
  normalizeChannel,
  normalizeDiscordConfig,
};
