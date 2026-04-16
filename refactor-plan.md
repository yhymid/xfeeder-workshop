# XFeeder Refactor Plan

Backup before refactor:
- `/home/ubuntu/yhymfiles/backups/xfeeder-backup-2026-04-16-111319.tar.gz`

## Goal

Refactor the current Node.js XFeeder safely, without changing behavior in the first phase.

Primary goals:
- split `main.js` into readable modules
- keep current config and runtime behavior working
- prepare clean separation for:
  - minimal runtime
  - full/workshop build
  - future Rust port

## Current Risk Areas

Main risk points in the current codebase:
- `main.js`
  - too many responsibilities in one file
  - cache, parser pipeline, SteamJSPipes bootstrap, channel scheduling, logging
- `message.js`
  - critical delivery path for Discord webhooks
- `src/parsers/downloader.js`
  - fetch + fallback logic is central and easy to break
- `src/workshop/*`
  - optional extension system mixed into main runtime
- `src/steamjspipes/*`
  - separate runtime concern that should not block minimal build

## Refactor Rules

Rules for safe migration:
- do not change `config.json` format in phase 1
- do not change outgoing message format in phase 1
- do not rewrite parser logic unless needed
- move code first, then simplify
- after every phase, keep runtime startable with `node main.js`
- workshop, scrapling and steamjspipes remain supported during the transition

## Target Structure

Phase-1 target structure inside current repo:

```text
xfeeder/
├── main.js
├── refactor-plan.md
├── config.json.example
├── src/
│   ├── app/
│   │   ├── bootstrap.js
│   │   ├── runtime.js
│   │   └── channel-runner.js
│   ├── core/
│   │   ├── cache-store.js
│   │   ├── feed-pipeline.js
│   │   ├── channel-config.js
│   │   ├── logger.js
│   │   └── normalize.js
│   ├── delivery/
│   │   └── discord-webhook.js
│   ├── extensions/
│   │   ├── workshop-runtime.js
│   │   ├── scrapling-runtime.js
│   │   └── steamjspipes-runtime.js
│   ├── client.js
│   ├── config-loader.js
│   ├── message.js
│   ├── parsers/
│   ├── scrapling/
│   ├── steamjspipes/
│   └── workshop/
```

Notes:
- old files stay temporarily where they are
- new modules wrap existing behavior first
- `message.js` may later delegate to `src/delivery/discord-webhook.js`

## Phase Plan

### Phase 1: Non-Behavioral Split

Goal:
- extract code from `main.js` without changing runtime logic

Work:
- move cache loading/saving into `src/core/cache-store.js`
- move link normalization and cache key helpers into `src/core/normalize.js`
- move parser orchestration from `fetchFeed()` into `src/core/feed-pipeline.js`
- move per-channel processing from `checkFeedsForChannel()` into `src/app/channel-runner.js`
- move SteamJSPipes bootstrap helpers into `src/extensions/steamjspipes-runtime.js`
- keep `main.js` as orchestration-only entrypoint

Done when:
- `main.js` becomes mostly wiring
- runtime behavior matches old version

### Phase 2: Config Cleanup Layer

Goal:
- simplify config usage without breaking existing config files

Work:
- add `src/core/channel-config.js`
- normalize channels into one internal structure
- support current fields:
  - `Webhook`
  - `Thread`
  - `RSS`
  - `TimeChecker`
  - `RequestSend`
  - `Discord`
  - `Matrix`
- prepare helper for easier RSS insertion later

Done when:
- all channel reads go through one normalization layer

### Phase 3: Minimal Runtime Preparation

Goal:
- define core runtime that excludes optional systems

Minimal runtime should include only:
- config loader
- HTTP client
- cache
- feed pipeline
- built-in parsers:
  - rss
  - atom
  - xml
  - json
  - youtube
- Discord webhook sender

Minimal runtime should exclude:
- workshop
- scrapling
- steamjspipes
- discord token parser
- freshrss self-bot style extras if they increase deployment complexity

Done when:
- we can copy the minimal set into a separate new project directory

### Phase 4: Optional Build Separation

Goal:
- split deliverables into separate folders under `yhymfiles`

Planned folders:

```text
yhymfiles/
├── xfeeder/                  # current main working repo
├── xfeeder-minimal/          # minimal runtime build
├── xfeeder-workshop/         # workshop/full build
└── xfeeder-rs/               # future Rust port
```

Rules:
- `xfeeder-minimal` must not depend on workshop
- `xfeeder-workshop` may reuse minimal core and add optional modules
- `xfeeder-rs` starts only after Node architecture is stable

### Phase 5: Readability Cleanup

Goal:
- fix naming and “weird things” after architecture is stabilized

Work:
- unify naming style
- reduce duplicate fallback logic
- clean mixed responsibility helpers
- document parser selection order
- isolate Discord-only special paths

Done when:
- the code is understandable without reading all 600+ lines of `main.js`

## Concrete First Refactor Slice

Start with the safest slice:

1. Create:
- `src/core/cache-store.js`
- `src/core/normalize.js`

2. Move from `main.js`:
- `saveCache`
- `normalizeLink`
- `getCacheKey`
- `pushCache`
- cache loading block

3. Keep public behavior identical:
- same `cache.json`
- same key generation
- same dedupe behavior

Why first:
- isolated
- low risk
- immediate reduction in `main.js`

## What Not To Touch Early

Do not refactor these in the first pass:
- actual parser internals
- webhook payload format in `message.js`
- Discord parser token flow
- Scrapling detector/CLI logic
- SteamJSPipes provider logic
- workshop plugin runtime contract

These should move only after the shell around them is stable.

## Testing Strategy Per Phase

Minimum checks after each phase:
- app starts with `node main.js`
- config still loads
- cache still loads and saves
- one RSS source still parses
- one YouTube source still parses
- one Discord webhook send path still works

Before copying into `xfeeder-minimal`:
- verify runtime works with workshop disabled
- verify no required import from `src/workshop`
- verify no required import from `src/steamjspipes`

## Release Direction

Planned product direction:
- current repo becomes staging area for cleanup
- `xfeeder-minimal` becomes stable deploy target
- `xfeeder-workshop` becomes extended build with plugins until `24.12.2026`
- Rust port begins only after minimal runtime scope is locked

## Next Implementation Step

Immediate next coding task:
- extract cache helpers from `main.js` into `src/core/cache-store.js`
- extract normalization helpers into `src/core/normalize.js`
- keep all behavior unchanged
