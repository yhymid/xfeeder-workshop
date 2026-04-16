"use strict";

const { SEND_DELAY_MS, getCacheKey, pushCache, sleep } = require("../core/normalize");

function createChannelRunner({
  cacheStore,
  fetchFeed,
  parseDiscord,
  sendMessage,
} = {}) {
  async function checkFeedsForChannel(index, channelConfig) {
    const cache = cacheStore.getState();
    const channelCache = cacheStore.getChannelBucket(index);

    if (channelConfig.Discord) {
      try {
        const discordMsgs = await parseDiscord(channelConfig.Discord);
        if (!channelCache.discord) channelCache.discord = [];

        const newMsgs = discordMsgs.filter(
          (msg) => !channelCache.discord.includes(msg.guid)
        );

        if (newMsgs.length > 0) {
          const toSend = newMsgs.slice(0, channelConfig.RequestSend || 5);
          const sentGuids = [];
          for (const entry of toSend.reverse()) {
            try {
              await sendMessage(
                channelConfig.Discord.Webhook,
                channelConfig.Discord.Thread,
                entry
              );
              if (entry.guid) sentGuids.push(entry.guid);
            } catch (err) {
              console.error(
                `[Channel ${index + 1}] Send failed (Discord): ${entry?.title || entry?.guid || "unknown"}: ${err.message}`
              );
            } finally {
              await sleep(SEND_DELAY_MS);
            }
          }

          if (sentGuids.length > 0) {
            channelCache.discord = pushCache(channelCache.discord, sentGuids);
            cacheStore.save();
          }

          const failedCount = toSend.length - sentGuids.length;
          console.log(
            `[Channel ${index + 1}] Sent ${sentGuids.length}/${toSend.length} (Discord). Failed: ${failedCount}.`
          );
        }
      } catch (err) {
        console.error(`[Channel ${index + 1}] Discord Error:`, err.message);
      }
    }

    if (channelConfig.RSS && Array.isArray(channelConfig.RSS)) {
      for (const feedUrl of channelConfig.RSS) {
        try {
          const items = await fetchFeed(feedUrl);
          if (!items.length) continue;

          if (!channelCache[feedUrl]) channelCache[feedUrl] = [];

          const newItems = items.filter((item) => {
            const key = getCacheKey(item);
            return key && !channelCache[feedUrl].includes(key);
          });

          if (newItems.length > 0) {
            const toSend = newItems.slice(0, channelConfig.RequestSend || 5);
            const sentKeys = [];
            for (const entry of toSend.reverse()) {
              try {
                await sendMessage(
                  channelConfig.Webhook,
                  channelConfig.Thread,
                  entry
                );
                const sentKey = getCacheKey(entry);
                if (sentKey) sentKeys.push(sentKey);
              } catch (err) {
                console.error(
                  `[Channel ${index + 1}] Send failed (${feedUrl}): ${entry?.title || entry?.link || "unknown"}: ${err.message}`
                );
              } finally {
                await sleep(SEND_DELAY_MS);
              }
            }

            if (sentKeys.length > 0) {
              channelCache[feedUrl] = pushCache(channelCache[feedUrl], sentKeys);
              cacheStore.save();
            }

            const failedCount = toSend.length - sentKeys.length;
            console.log(
              `[Channel ${index + 1}] Sent ${sentKeys.length}/${toSend.length} items from ${feedUrl}. Failed: ${failedCount}.`
            );
          }
        } catch (err) {
          console.error(`[Channel ${index + 1}] RSS Error ${feedUrl}:`, err.message);
        }
      }
    }

    return cache;
  }

  return {
    checkFeedsForChannel,
  };
}

module.exports = {
  createChannelRunner,
};
