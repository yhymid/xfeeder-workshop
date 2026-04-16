"use strict";

function isChangelistEvent(event) {
  return (
    event &&
    event.Type === "Changelist" &&
    Number.isFinite(Number(event.ChangeNumber))
  );
}

function applyAppWhitelist(event, whitelistApps = []) {
  if (!isChangelistEvent(event)) {
    return true;
  }

  if (!Array.isArray(whitelistApps) || whitelistApps.length === 0) {
    return true;
  }

  const apps = event.Apps && typeof event.Apps === "object" ? event.Apps : null;
  if (!apps) {
    return false;
  }

  const appIds = new Set(
    Object.keys(apps)
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0)
  );

  for (const candidate of whitelistApps) {
    const id = Number(candidate);
    if (Number.isFinite(id) && id > 0 && appIds.has(Math.floor(id))) {
      return true;
    }
  }

  return false;
}

module.exports = {
  isChangelistEvent,
  applyAppWhitelist,
};
