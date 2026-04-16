"use strict";

const DEFAULT_CACHE_BUCKET = "__steamjspipes__";

function ensureCacheBucket(cache, bucket = DEFAULT_CACHE_BUCKET) {
  if (!cache || typeof cache !== "object") {
    throw new Error("cache must be an object");
  }

  if (!Array.isArray(cache[bucket])) {
    cache[bucket] = [];
  }

  return cache[bucket];
}

function buildChangelistCacheKey(changeNumber) {
  return `steam:changelist:${changeNumber}`;
}

function hasSeenKey(cache, key, bucket = DEFAULT_CACHE_BUCKET) {
  const arr = ensureCacheBucket(cache, bucket);
  return arr.includes(key);
}

function markSeenKey(cache, key, bucket = DEFAULT_CACHE_BUCKET, limit = 5000) {
  const arr = ensureCacheBucket(cache, bucket);

  if (arr.includes(key)) {
    return false;
  }

  arr.unshift(key);
  if (arr.length > limit) {
    arr.length = limit;
  }

  return true;
}

module.exports = {
  DEFAULT_CACHE_BUCKET,
  ensureCacheBucket,
  buildChangelistCacheKey,
  hasSeenKey,
  markSeenKey,
};
