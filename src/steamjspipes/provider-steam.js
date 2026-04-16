"use strict";

const { EventEmitter } = require("events");

function numberOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function changeNumberFromValue(value, fallback) {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  return (
    numberOrNull(value.change_number) ??
    numberOrNull(value.changeNumber) ??
    numberOrNull(value.changenumber) ??
    numberOrNull(value.ChangeNumber) ??
    fallback
  );
}

function idFromKeyOrValue(key, value, kind) {
  const keyNum = numberOrNull(key);
  if (keyNum && keyNum > 0) {
    return keyNum;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  if (kind === "app") {
    return (
      numberOrNull(value.appid) ??
      numberOrNull(value.app_id) ??
      numberOrNull(value.id)
    );
  }

  return (
    numberOrNull(value.packageid) ??
    numberOrNull(value.package_id) ??
    numberOrNull(value.subid) ??
    numberOrNull(value.id)
  );
}

function objectEntries(value) {
  if (!value) return [];

  if (value instanceof Map) {
    return Array.from(value.entries());
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => [String(index), item]);
  }

  if (typeof value === "object") {
    return Object.entries(value);
  }

  return [];
}

function normalizeGetProductChangesResponse(payload) {
  if (!payload) return null;

  if (Array.isArray(payload)) {
    return {
      currentChangeNumber: payload[0],
      appChanges: payload[1],
      packageChanges: payload[2],
    };
  }

  if (typeof payload === "object") {
    return {
      currentChangeNumber:
        payload.currentChangeNumber ??
        payload.current_changenumber ??
        payload.current_changenumber ??
        payload.current ??
        payload.changeNumber,
      appChanges: payload.appChanges ?? payload.apps,
      packageChanges: payload.packageChanges ?? payload.packages,
    };
  }

  return null;
}

class SteamUserProvider extends EventEmitter {
  constructor({ logger = console } = {}) {
    super();
    this.logger = logger;
    this.client = null;
    this._connected = false;
    this._connecting = false;
    this._steamUserCtor = null;
  }

  isConnected() {
    return this._connected;
  }

  async connect() {
    if (this._connected || this._connecting) {
      return;
    }

    this._connecting = true;

    let SteamUser;
    try {
      SteamUser = this._resolveSteamUser();
    } catch (err) {
      this._connecting = false;
      throw err;
    }

    const client = new SteamUser({
      autoRelogin: false,
      enablePicsCache: false,
    });

    this.client = client;
    this._bindClientEvents(client);

    try {
      client.logOn({ anonymous: true });
    } catch (err) {
      this._connecting = false;
      throw err;
    }
  }

  disconnect() {
    this._connected = false;
    this._connecting = false;

    if (!this.client) {
      return;
    }

    try {
      this.client.logOff();
    } catch {
      // no-op
    }

    try {
      this.client.removeAllListeners();
    } catch {
      // no-op
    }

    this.client = null;
  }

  async getProductChanges(sinceChangeNumber) {
    if (!this.client || !this._connected) {
      throw new Error("Steam provider is not connected");
    }

    const since = numberOrNull(sinceChangeNumber) || 0;
    const raw = await this._callGetProductChanges(since);

    const current = numberOrNull(raw.currentChangeNumber) || since;
    const appChanges = raw.appChanges || {};
    const packageChanges = raw.packageChanges || {};

    const grouped = new Map();

    for (const [key, value] of objectEntries(appChanges)) {
      const appId = idFromKeyOrValue(key, value, "app");
      if (!appId || appId <= 0) continue;

      const changeNumber = changeNumberFromValue(value, current);
      if (!grouped.has(changeNumber)) {
        grouped.set(changeNumber, { Apps: {}, Packages: {} });
      }
      grouped.get(changeNumber).Apps[String(appId)] = `Unknown App ${appId}`;
    }

    for (const [key, value] of objectEntries(packageChanges)) {
      const packageId = idFromKeyOrValue(key, value, "package");
      if (!packageId || packageId <= 0) continue;

      const changeNumber = changeNumberFromValue(value, current);
      if (!grouped.has(changeNumber)) {
        grouped.set(changeNumber, { Apps: {}, Packages: {} });
      }
      grouped.get(changeNumber).Packages[String(packageId)] =
        `Unknown Package ${packageId}`;
    }

    const events = Array.from(grouped.entries())
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([changeNumber, data]) => ({
        Type: "Changelist",
        ChangeNumber: Number(changeNumber),
        Apps: data.Apps,
        Packages: data.Packages,
      }));

    return {
      currentChangeNumber: current,
      events,
    };
  }

  async getUsersOnline() {
    return null;
  }

  _resolveSteamUser() {
    if (this._steamUserCtor) {
      return this._steamUserCtor;
    }

    let SteamUser;
    try {
      SteamUser = require("steam-user");
    } catch (err) {
      const wrapped = new Error(
        "Missing dependency 'steam-user'. Install it with: npm install steam-user"
      );
      wrapped.cause = err;
      throw wrapped;
    }

    this._steamUserCtor = SteamUser;
    return SteamUser;
  }

  _bindClientEvents(client) {
    client.on("loggedOn", () => {
      this._connecting = false;
      this._connected = true;
      this.emit("logon", { Type: "LogOn" });
    });

    client.on("loggedOff", () => {
      const wasConnected = this._connected;
      this._connecting = false;
      this._connected = false;
      if (wasConnected) {
        this.emit("logoff", { Type: "LogOff" });
      }
    });

    client.on("disconnected", () => {
      const wasConnected = this._connected;
      this._connecting = false;
      this._connected = false;
      if (wasConnected) {
        this.emit("logoff", { Type: "LogOff" });
      }
    });

    client.on("error", (err) => {
      this.emit("error", err);
    });
  }

  async _callGetProductChanges(since) {
    const client = this.client;

    const fn =
      (client && client.getProductChanges) ||
      (client && client.picsGetProductChanges) ||
      (client && client.getProductChangesSince);

    if (typeof fn !== "function") {
      throw new Error("steam-user does not expose getProductChanges API");
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      const finish = (err, currentChangeNumber, appChanges, packageChanges) => {
        if (settled) return;
        settled = true;

        if (err) {
          reject(err);
          return;
        }

        resolve({ currentChangeNumber, appChanges, packageChanges });
      };

      let result;
      try {
        result = fn.call(client, since, finish);
      } catch (err) {
        settled = true;
        reject(err);
        return;
      }

      if (result && typeof result.then === "function") {
        result
          .then((payload) => {
            if (settled) return;
            settled = true;

            const normalized = normalizeGetProductChangesResponse(payload);
            if (!normalized) {
              reject(new Error("Invalid getProductChanges response payload"));
              return;
            }

            resolve(normalized);
          })
          .catch((err) => {
            if (settled) return;
            settled = true;
            reject(err);
          });
      }
    });
  }
}

module.exports = {
  SteamUserProvider,
};
