"use strict";

function startChannelQueue({
  allChannels,
  checkFeedsForChannel,
  steamBridge,
  delayBetweenChannels = 30000,
} = {}) {
  if (!Array.isArray(allChannels) || allChannels.length === 0) {
    if (!steamBridge) {
      console.error("[System] No valid channels configured. Queue not started.");
    } else {
      console.warn(
        "[System] No regular channels configured. RSS queue disabled, SteamJSPipes listener active."
      );
    }
    return null;
  }

  let lastCheck = new Array(allChannels.length).fill(0);
  let currentIndex = 0;
  let timer = null;
  let stopped = false;

  async function processNextChannel() {
    if (stopped) return;

    const channel = allChannels[currentIndex];
    if (!channel) {
      currentIndex = (currentIndex + 1) % allChannels.length;
      timer = setTimeout(processNextChannel, delayBetweenChannels);
      return;
    }

    const now = Date.now();
    const minutes = channel.TimeChecker || 30;
    const minDelay = minutes * 60 * 1000;

    if (now - lastCheck[currentIndex] >= minDelay) {
      console.log(`[Queue] Checking channel ${currentIndex + 1}/${allChannels.length}`);
      try {
        await checkFeedsForChannel(currentIndex, channel);
        lastCheck[currentIndex] = Date.now();
      } catch (err) {
        console.error(`[Queue] Channel ${currentIndex + 1} error:`, err.message);
      }
    }

    currentIndex = (currentIndex + 1) % allChannels.length;
    timer = setTimeout(processNextChannel, delayBetweenChannels);
  }

  processNextChannel();

  return {
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    getState() {
      return {
        currentIndex,
        totalChannels: allChannels.length,
        lastCheck: [...lastCheck],
      };
    },
  };
}

module.exports = {
  startChannelQueue,
};
