"use strict";

const fs = require("fs");

function createCacheStore(cacheFile = "./cache.json") {
  let cache = {};

  function load() {
    if (!fs.existsSync(cacheFile)) {
      cache = {};
      return cache;
    }

    try {
      cache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      console.log(`[Cache] Loaded (${Object.keys(cache).length} channels)`);
    } catch {
      console.warn("[Cache] Error reading cache.json — creating new.");
      cache = {};
    }

    return cache;
  }

  function save() {
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2), "utf8");
  }

  function getState() {
    return cache;
  }

  function getChannelBucket(index) {
    if (!cache[index]) cache[index] = {};
    return cache[index];
  }

  function replaceState(next) {
    cache = next && typeof next === "object" ? next : {};
    return cache;
  }

  load();

  return {
    load,
    save,
    getState,
    getChannelBucket,
    replaceState,
  };
}

module.exports = {
  createCacheStore,
};
