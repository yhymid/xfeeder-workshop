"use strict";

const SEND_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeLink(u) {
  try {
    const url = new URL(u);
    url.hash = "";
    const removeParams = new Set([
      "utm_source", "utm_medium", "utm_campaign", "utm_term",
      "utm_content", "utm_name", "fbclid", "gclid", "yclid",
      "mc_cid", "mc_eid", "ref",
    ]);
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLowerCase().startsWith("utm_") || removeParams.has(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return u;
  }
}

function getCacheKey(item) {
  return normalizeLink(item.link || item.guid || "");
}

function pushCache(list, ids, limit = 2000) {
  const prev = Array.isArray(list) ? list : [];
  const merged = [...ids, ...prev];
  if (merged.length > limit) merged.length = limit;
  return merged;
}

module.exports = {
  SEND_DELAY_MS,
  sleep,
  normalizeLink,
  getCacheKey,
  pushCache,
};
