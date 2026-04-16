"use strict";

const DEFAULTS = Object.freeze({
  enabled: false,
  channelIndex: 0,
  whitelistApps: [],
  pollIntervalMs: 3000,
  initialDelayMs: 60000,
  reconnectInitialDelayMs: 2000,
  reconnectMaxDelayMs: 60000,
  reconnectJitterMs: 1200,
  maxReconnectAttempts: 0, // 0 = unlimited
  cacheLimit: 5000,
  stateFile: "./steamjspipes-state.json",
  statusEvents: true,
  usersOnlineEvents: false,
  steamDbBase: "https://steamdb.info",
  maxAppsInSnippet: 20,
  maxPackagesInSnippet: 20,
});

function toNonNegativeInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function toPositiveInt(value, fallback, min = 1) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) return fallback;
  return Math.floor(n);
}

function normalizeIdList(input) {
  if (!Array.isArray(input)) return [];

  const result = [];
  for (const raw of input) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      result.push(Math.floor(n));
    }
  }

  return Array.from(new Set(result));
}

function resolveSteamJSPipesConfig(rootConfig = {}) {
  const raw = rootConfig.SteamJSPipes || rootConfig.SteamPipes || {};

  return {
    enabled: Boolean(raw.Enabled ?? raw.enabled ?? DEFAULTS.enabled),
    channelIndex: toNonNegativeInt(
      raw.ChannelIndex ?? raw.channelIndex,
      DEFAULTS.channelIndex
    ),
    whitelistApps: normalizeIdList(
      raw.WhitelistApps ?? raw.whitelistApps ?? DEFAULTS.whitelistApps
    ),
    pollIntervalMs: toPositiveInt(
      raw.PollIntervalMs ?? raw.pollIntervalMs,
      DEFAULTS.pollIntervalMs
    ),
    initialDelayMs: toNonNegativeInt(
      raw.InitialDelayMs ?? raw.initialDelayMs,
      DEFAULTS.initialDelayMs
    ),
    reconnectInitialDelayMs: toPositiveInt(
      raw.ReconnectInitialDelayMs ?? raw.reconnectInitialDelayMs,
      DEFAULTS.reconnectInitialDelayMs
    ),
    reconnectMaxDelayMs: toPositiveInt(
      raw.ReconnectMaxDelayMs ?? raw.reconnectMaxDelayMs,
      DEFAULTS.reconnectMaxDelayMs
    ),
    reconnectJitterMs: toNonNegativeInt(
      raw.ReconnectJitterMs ?? raw.reconnectJitterMs,
      DEFAULTS.reconnectJitterMs
    ),
    maxReconnectAttempts: toNonNegativeInt(
      raw.MaxReconnectAttempts ?? raw.maxReconnectAttempts,
      DEFAULTS.maxReconnectAttempts
    ),
    cacheLimit: toPositiveInt(
      raw.CacheLimit ?? raw.cacheLimit,
      DEFAULTS.cacheLimit
    ),
    stateFile: String(raw.StateFile ?? raw.stateFile ?? DEFAULTS.stateFile),
    statusEvents: Boolean(raw.StatusEvents ?? raw.statusEvents ?? DEFAULTS.statusEvents),
    usersOnlineEvents: Boolean(
      raw.UsersOnlineEvents ?? raw.usersOnlineEvents ?? DEFAULTS.usersOnlineEvents
    ),
    steamDbBase: String(raw.SteamDbBase ?? raw.steamDbBase ?? DEFAULTS.steamDbBase).replace(
      /\/+$/,
      ""
    ),
    maxAppsInSnippet: toPositiveInt(
      raw.MaxAppsInSnippet ?? raw.maxAppsInSnippet,
      DEFAULTS.maxAppsInSnippet
    ),
    maxPackagesInSnippet: toPositiveInt(
      raw.MaxPackagesInSnippet ?? raw.maxPackagesInSnippet,
      DEFAULTS.maxPackagesInSnippet
    ),
  };
}

module.exports = {
  DEFAULTS,
  normalizeIdList,
  resolveSteamJSPipesConfig,
};
