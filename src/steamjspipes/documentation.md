# SteamJSPipes (Native JS)

SteamJSPipes is a native Node.js Steam changelist runtime for XFeeder.

## What it does

- Logs into Steam anonymously using `steam-user`
- Polls PICS changelists without any external `.NET` service
- Emits Steam-style events:
  - `LogOn`
  - `LogOff`
  - `Changelist`
  - `UsersOnline` (optional, provider dependent)
- Deduplicates changelists via `cache.json`
- Persists `lastChangeNumber` in `StateFile`
- Supports app whitelist filtering (`WhitelistApps`)
- Works in two modes:
  - Embedded in `main.js`
  - Standalone CLI (`node src/steamjspipes/cli.js`)

## Config

```json
{
  "SteamJSPipes": {
    "Enabled": false,
    "ChannelIndex": 0,
    "WhitelistApps": [730],
    "PollIntervalMs": 3000,
    "InitialDelayMs": 60000,
    "ReconnectInitialDelayMs": 2000,
    "ReconnectMaxDelayMs": 60000,
    "ReconnectJitterMs": 1200,
    "MaxReconnectAttempts": 0,
    "CacheLimit": 5000,
    "StateFile": "./steamjspipes-state.json",
    "StatusEvents": true,
    "UsersOnlineEvents": false,
    "SteamDbBase": "https://steamdb.info"
  }
}
```

## CLI

```bash
node src/steamjspipes/cli.js ./config.json
```

## Notes

- `WhitelistApps: []` means no filtering (all app changelists pass).
- Changelists with only package changes are dropped when app whitelist is active.
- Dependency required: `steam-user`.
