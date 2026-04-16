"use strict";

const fs = require("fs");
const path = require("path");
const { resolveSteamJSPipesConfig } = require("./config");
const { SteamUserProvider } = require("./provider-steam");

function nowIso() {
  return new Date().toISOString();
}

function toNonNegativeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function resolveStateFilePath(stateFile) {
  return path.resolve(process.cwd(), stateFile || "./steamjspipes-state.json");
}

function loadState(statePath) {
  if (!fs.existsSync(statePath)) {
    return { lastChangeNumber: 0 };
  }

  try {
    const text = fs.readFileSync(statePath, "utf8").trim();
    if (!text) {
      return { lastChangeNumber: 0 };
    }

    if (/^\d+$/.test(text)) {
      return { lastChangeNumber: toNonNegativeInt(text, 0) };
    }

    const parsed = JSON.parse(text);
    return {
      lastChangeNumber: toNonNegativeInt(parsed.lastChangeNumber, 0),
    };
  } catch {
    return { lastChangeNumber: 0 };
  }
}

function saveState(statePath, state) {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          lastChangeNumber: toNonNegativeInt(state.lastChangeNumber, 0),
          updatedAt: nowIso(),
        },
        null,
        2
      ),
      "utf8"
    );
  } catch {
    // Intentionally ignored; runtime continues without persistence.
  }
}

function createSteamJSPipesRuntime({
  rootConfig,
  config,
  logger = console,
  onEvent,
  onStateChange,
  onError,
} = {}) {
  const resolvedConfig = config || resolveSteamJSPipesConfig(rootConfig);
  const statePath = resolveStateFilePath(resolvedConfig.stateFile);

  let provider = null;
  let started = false;
  let pollTimer = null;
  let initialTimer = null;
  let reconnectTimer = null;
  let pollInFlight = false;
  let reconnectAttempts = 0;

  const state = loadState(statePath);

  const stats = {
    startedAt: null,
    stoppedAt: null,
    connectedAt: null,
    disconnectedAt: null,
    pollCount: 0,
    changelistsSeen: 0,
    reconnectsScheduled: 0,
    errors: 0,
    logOnEvents: 0,
    logOffEvents: 0,
    lastPollAt: null,
    lastChangeNumber: state.lastChangeNumber,
  };

  async function emitEvent(event) {
    if (typeof onEvent !== "function") {
      return;
    }

    try {
      await onEvent(event);
    } catch (err) {
      reportError(err);
    }
  }

  function emitState(stateEvent) {
    try {
      onStateChange?.(stateEvent);
    } catch (err) {
      reportError(err);
    }
  }

  function reportError(err) {
    stats.errors += 1;
    try {
      onError?.(err);
    } catch {
      // ignored
    }
    logger.error?.("[SteamJSPipes]", err?.message || err);
  }

  function clearTimers() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    if (initialTimer) {
      clearTimeout(initialTimer);
      initialTimer = null;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  async function pollOnce() {
    if (!started || !provider || !provider.isConnected()) {
      return;
    }

    if (pollInFlight) {
      return;
    }

    pollInFlight = true;
    stats.pollCount += 1;
    stats.lastPollAt = nowIso();

    try {
      const since = toNonNegativeInt(state.lastChangeNumber, 0);
      const result = await provider.getProductChanges(since);
      const currentChangeNumber = toNonNegativeInt(result.currentChangeNumber, since);
      const events = Array.isArray(result.events) ? result.events : [];

      for (const event of events) {
        const cn = toNonNegativeInt(event.ChangeNumber, 0);
        if (cn > state.lastChangeNumber) {
          state.lastChangeNumber = cn;
          stats.lastChangeNumber = cn;
        }

        stats.changelistsSeen += 1;
        await emitEvent(event);
      }

      if (currentChangeNumber > state.lastChangeNumber) {
        state.lastChangeNumber = currentChangeNumber;
        stats.lastChangeNumber = currentChangeNumber;
      }

      saveState(statePath, state);

      if (resolvedConfig.usersOnlineEvents) {
        const users = await provider.getUsersOnline();
        if (Number.isFinite(Number(users))) {
          await emitEvent({ Type: "UsersOnline", Users: Number(users) });
        }
      }
    } catch (err) {
      reportError(err);
    } finally {
      pollInFlight = false;
    }
  }

  function startPollingLoop() {
    if (!started) {
      return;
    }

    if (initialTimer || pollTimer) {
      return;
    }

    const firstDelay = toNonNegativeInt(resolvedConfig.initialDelayMs, 0);
    initialTimer = setTimeout(async () => {
      initialTimer = null;

      await pollOnce();

      const everyMs = toNonNegativeInt(resolvedConfig.pollIntervalMs, 3000);
      pollTimer = setInterval(() => {
        pollOnce().catch((err) => reportError(err));
      }, everyMs);
    }, firstDelay);
  }

  function scheduleReconnect() {
    if (!started) {
      return;
    }

    if (reconnectTimer) {
      return;
    }

    const nextAttempt = reconnectAttempts + 1;
    const maxAttempts = toNonNegativeInt(resolvedConfig.maxReconnectAttempts, 0);

    if (maxAttempts > 0 && nextAttempt > maxAttempts) {
      emitState({
        type: "stopped",
        reason: "max-reconnect-attempts",
      });
      stop();
      return;
    }

    reconnectAttempts = nextAttempt;

    const base = toNonNegativeInt(resolvedConfig.reconnectInitialDelayMs, 2000);
    const cap = toNonNegativeInt(resolvedConfig.reconnectMaxDelayMs, 60000);
    const jitterMax = toNonNegativeInt(resolvedConfig.reconnectJitterMs, 1200);
    const expDelay = Math.min(cap, base * Math.pow(2, reconnectAttempts - 1));
    const jitter = jitterMax > 0 ? Math.floor(Math.random() * jitterMax) : 0;
    const delayMs = expDelay + jitter;

    stats.reconnectsScheduled += 1;

    emitState({
      type: "reconnect-scheduled",
      attempt: reconnectAttempts,
      delayMs,
    });

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectProvider();
    }, delayMs);
  }

  function wireProviderEvents() {
    if (!provider) {
      return;
    }

    provider.on("logon", async () => {
      stats.connectedAt = nowIso();
      stats.logOnEvents += 1;
      reconnectAttempts = 0;

      await emitEvent({ Type: "LogOn" });
      emitState({ type: "open" });
      startPollingLoop();
    });

    provider.on("logoff", async () => {
      stats.disconnectedAt = nowIso();
      stats.logOffEvents += 1;

      await emitEvent({ Type: "LogOff" });
      clearTimers();
      scheduleReconnect();
    });

    provider.on("error", (err) => {
      reportError(err);
    });
  }

  function connectProvider() {
    if (!started) {
      return;
    }

    if (!provider) {
      provider = new SteamUserProvider({ logger });
      wireProviderEvents();
    }

    emitState({ type: "connecting" });

    provider.connect().catch((err) => {
      reportError(err);
      scheduleReconnect();
    });
  }

  function start() {
    if (started) {
      return false;
    }

    started = true;
    stats.startedAt = nowIso();

    connectProvider();
    return true;
  }

  function stop() {
    if (!started) {
      return;
    }

    started = false;
    stats.stoppedAt = nowIso();

    clearTimers();
    saveState(statePath, state);

    if (provider) {
      provider.disconnect();
      provider = null;
    }
  }

  function getStats() {
    return {
      ...stats,
      running: started,
      stateFile: statePath,
    };
  }

  return {
    config: resolvedConfig,
    start,
    stop,
    getStats,
  };
}

module.exports = {
  createSteamJSPipesRuntime,
};
