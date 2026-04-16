"use strict";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function sortNumeric(a, b) {
  return Number(a[0]) - Number(b[0]);
}

function takeLimited(entries, limit) {
  if (!Number.isFinite(limit) || limit <= 0 || entries.length <= limit) {
    return { selected: entries, omitted: 0 };
  }

  return {
    selected: entries.slice(0, limit),
    omitted: entries.length - limit,
  };
}

function section(title, list, omitted) {
  if (list.length === 0) {
    return `${title}: none`;
  }

  const lines = [`${title} (${list.length + omitted}):`];
  for (const [id, name] of list) {
    lines.push(`- ${name || `Unknown ${title.slice(0, -1)} ${id}`} (${id})`);
  }
  if (omitted > 0) {
    lines.push(`- ... and ${omitted} more`);
  }

  return lines.join("\n");
}

function mapChangelistEventToEntry(event, options = {}) {
  if (!event || event.Type !== "Changelist") {
    return null;
  }

  const changeNumber = Number(event.ChangeNumber);
  if (!Number.isFinite(changeNumber)) {
    return null;
  }

  const steamDbBase = String(options.steamDbBase || "https://steamdb.info").replace(
    /\/+$/,
    ""
  );
  const apps = Object.entries(asObject(event.Apps)).sort(sortNumeric);
  const packages = Object.entries(asObject(event.Packages)).sort(sortNumeric);

  const appsView = takeLimited(apps, Number(options.maxAppsInSnippet) || 20);
  const packagesView = takeLimited(
    packages,
    Number(options.maxPackagesInSnippet) || 20
  );

  const appCount = apps.length;
  const packageCount = packages.length;

  const snippet = [
    `Steam changelist #${changeNumber}`,
    `Apps changed: ${appCount}`,
    `Packages changed: ${packageCount}`,
    "",
    section("Apps", appsView.selected, appsView.omitted),
    "",
    section("Packages", packagesView.selected, packagesView.omitted),
  ].join("\n");

  const categories = ["steam", "steam-changelist"];
  for (const [appId] of apps.slice(0, 5)) {
    categories.push(`steam-app:${appId}`);
  }

  return {
    title: `Steam Changelist #${changeNumber} (apps: ${appCount}, packages: ${packageCount})`,
    link: `${steamDbBase}/changelist/${changeNumber}/`,
    contentSnippet: snippet,
    isoDate: new Date().toISOString(),
    enclosure: null,
    author: "SteamJSPipes",
    guid: `steam:changelist:${changeNumber}`,
    categories,
  };
}

module.exports = {
  mapChangelistEventToEntry,
};
