// src/parsers/downloader.js - HTTP downloader with Scrapling integration
"use strict";

const { getWithFallback } = require("../client");
const { getScrapling } = require("../scrapling");

/**
 * Builds Accept header based on content type hint
 * 
 * @param {string} accept - Content type hint: 'auto', 'xml', 'rss', 'atom', 'json', 'html'
 * @returns {string} Accept header value
 */
function buildAccept(accept) {
  switch ((accept || "auto").toLowerCase()) {
    case "xml":
    case "rss":
    case "atom":
      return "application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8";
    case "json":
      return "application/feed+json,application/json,text/json;q=0.9,*/*;q=0.8";
    case "html":
      return "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
    case "auto":
    default:
      return "application/rss+xml,application/atom+xml,application/xml,application/json;q=0.9,*/*;q=0.8";
  }
}

/**
 * Check if response indicates protection that Scrapling can bypass
 * 
 * @param {object} response - Response object or error
 * @returns {boolean} True if should try Scrapling
 */
function shouldTryScrapling(response) {
  if (!response) return false;
  
  const scrapling = getScrapling();
  if (!scrapling.enabled) return false;
  
  // Check status codes
  const status = response?.status || response?.response?.status;
  if (scrapling.utils.isProtectedStatus(status)) {
    console.log(`[Downloader] Status ${status} detected - will try Scrapling`);
    return true;
  }
  
  // Check for Cloudflare headers
  const headers = response?.headers || response?.response?.headers;
  if (headers && scrapling.utils.isCloudflareProtected(headers)) {
    console.log('[Downloader] Cloudflare detected - will try Scrapling');
    return true;
  }
  
  // Check for specific error messages
  const errorMessage = response?.message || response?.response?.data || '';
  const protectionIndicators = [
    'cloudflare',
    'cf-ray',
    'access denied',
    'please enable cookies',
    'checking your browser',
    'just a moment',
    'ddos protection',
    'rate limit'
  ];
  
  if (typeof errorMessage === 'string') {
    const lowerMessage = errorMessage.toLowerCase();
    for (const indicator of protectionIndicators) {
      if (lowerMessage.includes(indicator)) {
        console.log(`[Downloader] Protection indicator "${indicator}" found - will try Scrapling`);
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Try to fetch with Scrapling
 * 
 * @param {string} url - URL to fetch
 * @param {object} opts - Original options
 * @returns {Promise<object>} Result object
 */
async function fetchWithScrapling(url, opts = {}) {
  const scrapling = getScrapling();
  
  // Get Scrapling config for this URL
  const scraplingConfig = scrapling.config.getUrlConfig(url);
  
  // Merge with any explicit Scrapling options
  const scraplingOptions = {
    ...scraplingConfig,
    ...(opts.scrapling || {}),
    headers: opts.headers || {},
    timeout: resolveScraplingTimeout(opts.timeout, scraplingConfig.timeout),
  };
  
  // Add proxy if configured
  const proxyUrl = opts.proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  if (proxyUrl) {
    scraplingOptions.proxy = proxyUrl;
  }
  
  console.log(`[Downloader] Using Scrapling (${scraplingOptions.mode || 'stealthy-fetch'}) for ${url}`);
  
  try {
    const startTime = Date.now();
    const response = await scrapling.fetch(url, scraplingOptions);
    const elapsed = Date.now() - startTime;
    
    console.log(`[Downloader] Scrapling success in ${elapsed}ms`);
    
    // Parse content type from HTML if possible
    let contentType = 'text/html';
    if (response.html) {
      // Check if it's actually XML/RSS/Atom
      const format = scrapling.utils.detectFeedFormat(response.html);
      if (format === 'rss') contentType = 'application/rss+xml';
      else if (format === 'atom') contentType = 'application/atom+xml';
      else if (format === 'json') contentType = 'application/json';
    }
    
    return {
      ok: true,
      status: response.status || 200,
      headers: response.headers || { 'content-type': contentType },
      data: response.html || response.data,
      contentType,
      scrapling: true,
      scraplingMode: response.fetchMode,
      elapsed: response.elapsed
    };
    
  } catch (err) {
    console.error(`[Downloader] Scrapling failed: ${err.message}`);
    
    // Return error info for upstream handling
    return {
      ok: false,
      error: err,
      scraplingFailed: true
    };
  }
}

function resolveScraplingTimeout(inputTimeout, configTimeout) {
  // Downloader timeout is usually provided in ms. Scrapling wrappers expect seconds.
  if (typeof inputTimeout === 'number' && Number.isFinite(inputTimeout) && inputTimeout > 0) {
    if (inputTimeout > 1000) return Math.max(1, Math.floor(inputTimeout / 1000));
    return Math.floor(inputTimeout);
  }
  if (typeof configTimeout === 'number' && Number.isFinite(configTimeout) && configTimeout > 0) {
    return Math.floor(configTimeout);
  }
  return 60;
}

/**
 * Downloads URL content with automatic Scrapling fallback
 * - Handles 304 (not modified) as success with notModified: true
 * - For non-http/https schemes returns ok:false with reason: "UNSUPPORTED_PROTOCOL"
 * - Automatically tries Scrapling on protection/errors
 *
 * @param {string} url - URL to download
 * @param {object} opts - Options: accept, headers, timeout, useScrapling
 * @returns {Promise<object>} Result object with ok, status, headers, data, contentType, notModified, reason, error
 */
async function download(url, opts = {}) {
  // Guard: non-http/https schemes
  let u;
  try {
    u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { ok: false, reason: "UNSUPPORTED_PROTOCOL" };
    }
  } catch (err) {
    // Invalid URL -> let getWithFallback throw a readable error
    console.error(`[Downloader] Invalid URL: ${url}`);
    return { ok: false, error: err, reason: "INVALID_URL" };
  }

  // Check if Scrapling should be used explicitly for this URL
  const scrapling = getScrapling();
  const forceScrapling = opts.useScrapling || 
                        (scrapling.enabled && scrapling.config.shouldUseScrapling(url));
  
  if (forceScrapling) {
    console.log(`[Downloader] Scrapling explicitly requested for ${url}`);
    const result = await fetchWithScrapling(url, opts);
    if (result.ok) return result;
    // If Scrapling failed and it was forced, don't try normal fetch
    if (opts.useScrapling) {
      return result;
    }
    // Otherwise fall through to try normal fetch
  }

  const headers = {
    Accept: buildAccept(opts.accept),
    ...(opts.headers || {}),
  };

  // Add conditional request headers if provided
  if (opts.etag) {
    headers['If-None-Match'] = opts.etag;
  }
  if (opts.lastModified) {
    headers['If-Modified-Since'] = opts.lastModified;
  }

  try {
    const res = await getWithFallback(url, { 
      headers, 
      timeout: opts.timeout,
      responseType: opts.responseType
    });
    
    // Treat 304 as "no changes" (not an error)
    if (res?.status === 304) {
      return {
        ok: true,
        status: 304,
        headers: res.headers || {},
        data: "",
        notModified: true
      };
    }

    // Check if response indicates protection
    if (shouldTryScrapling(res)) {
      const scraplingResult = await fetchWithScrapling(url, opts);
      if (scraplingResult.ok) {
        return scraplingResult;
      }
      // If Scrapling also failed, return original response
      console.log('[Downloader] Scrapling failed, returning original response');
    }

    const ct = (res?.headers?.["content-type"] || res?.headers?.["Content-Type"] || "").toString();
    
    return {
      ok: true,
      status: res?.status,
      headers: res?.headers || {},
      data: res?.data,
      contentType: ct,
    };
    
  } catch (err) {
    // Check if error indicates protection
    if (shouldTryScrapling(err)) {
      const scraplingResult = await fetchWithScrapling(url, opts);
      if (scraplingResult.ok) {
        return scraplingResult;
      }
    }
    
    // Return original error
    return {
      ok: false,
      error: err,
      status: err?.response?.status
    };
  }
}

/**
 * Parse HTML content to feed items if needed
 * Used when Scrapling returns HTML that needs to be converted to feed format
 * 
 * @param {string} data - HTML content
 * @param {string} url - Original URL for context
 * @returns {Array} Feed items or null if not HTML
 */
function parseHtmlToFeedItems(data, url) {
  const scrapling = getScrapling();
  
  // Check if it's HTML that needs parsing
  if (!data || typeof data !== 'string') return null;
  
  const format = scrapling.utils.detectFeedFormat(data);
  if (format !== 'html') return null;
  
  console.log('[Downloader] Converting HTML to feed items');
  
  // Get custom selectors from config if available
  const config = scrapling.config.getUrlConfig(url);
  const parseOptions = config.htmlParseOptions || {};
  
  // Parse HTML to feed items
  const items = scrapling.parseHtmlToFeed(data, parseOptions);
  
  if (items.length > 0) {
    console.log(`[Downloader] Extracted ${items.length} items from HTML`);
  } else {
    console.warn('[Downloader] No items extracted from HTML');
  }
  
  return items;
}

/**
 * Enhanced download with automatic HTML to feed conversion
 * 
 * @param {string} url - URL to download
 * @param {object} opts - Download options
 * @returns {Promise<object>} Result with data and possible feedItems
 */
async function downloadEnhanced(url, opts = {}) {
  const result = await download(url, opts);
  
  // If Scrapling was used and returned HTML, try to convert to feed
  if (result.ok && result.scrapling && result.data) {
    const feedItems = parseHtmlToFeedItems(result.data, url);
    if (feedItems && feedItems.length > 0) {
      result.feedItems = feedItems;
      result.isHtmlConverted = true;
    }
  }
  
  return result;
}

// Cache for ETags and Last-Modified headers
const metadataCache = new Map();

/**
 * Download with caching support
 * 
 * @param {string} url - URL to download
 * @param {object} opts - Download options
 * @returns {Promise<object>} Result object
 */
async function downloadWithCache(url, opts = {}) {
  // Get cached metadata
  const cached = metadataCache.get(url);
  
  if (cached) {
    opts.etag = cached.etag;
    opts.lastModified = cached.lastModified;
  }
  
  const result = await downloadEnhanced(url, opts);
  
  // Update cache if successful
  if (result.ok && !result.notModified) {
    const etag = result.headers?.etag || result.headers?.ETag;
    const lastModified = result.headers?.['last-modified'] || result.headers?.['Last-Modified'];
    
    if (etag || lastModified) {
      metadataCache.set(url, { etag, lastModified });
    }
  }
  
  return result;
}

// Export all functions
module.exports = { 
  download,
  downloadEnhanced,
  downloadWithCache,
  buildAccept,
  shouldTryScrapling,
  fetchWithScrapling,
  parseHtmlToFeedItems
};
