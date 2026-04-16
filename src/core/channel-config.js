"use strict";

function normalizeFeedList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
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

function normalizeChannel(channel, index) {
  const normalized = {
    index,
    sourceKey: channel.__sourceKey || null,
    Webhook: typeof channel.Webhook === "string" ? channel.Webhook.trim() : "",
    Thread: normalizeThreadValue(channel.Thread),
    RSS: normalizeFeedList(channel.RSS),
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

  for (const [key, value] of Object.entries(config || {})) {
    if (!key.toLowerCase().startsWith("channels") || !Array.isArray(value)) {
      continue;
    }

    for (const channel of value) {
      if (!channel || typeof channel !== "object") continue;
      result.push({
        ...channel,
        __sourceKey: key,
      });
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
