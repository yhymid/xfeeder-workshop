# XFeeder Workshop

Full build of XFeeder with workshop plugins and optional extension modules.

## Included

- RSS
- Atom
- XML
- JSON
- YouTube feed parsing
- Discord forwarding parser
- FreshRSS and custom API parsers
- Discord webhook delivery
- cache + dedupe
- Workshop plugin loader
- optional Scrapling fallback
- optional SteamJSPipes bridge

## Quick Start

1. Copy config and env:

```bash
cp config.json.example config.json
cp .env.example .env
```

2. Fill required values in `config.json` and `.env`

3. Install dependencies:

```bash
npm install
```

4. Start:

```bash
npm start
```

## Notes

- this is the full Node.js build, separate from `xfeeder-minimal`
- channel feed lists can be written as `Feeds`, `RSS`, `URLs`, or `Sources`
- channels can now be short strings, arrays, or named objects using `ChannelDefaults`
- `Workshop` and `SteamJSPipes` are optional at runtime and can stay disabled in config
- generated files like `cache.json` are ignored from git

## Goal

This folder is the clean base for:
- full GitHub release build
- workshop support until `24.12.2026`
- planned plugin releases in the full runtime line
