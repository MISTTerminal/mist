# Changelog

All notable changes to MIST are listed here. Versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

## [0.1.0] - 2026-11-25

First public release.

### Added

- **Terminal.** Trending, new pairs and top gainers, token pages with live candles and a trade tape, search, one-click buys and sells.
- **Vault.** A seed made in the tab, encrypted with PBKDF2 and AES-256-GCM, with a recovery key and per-compartment key export.
- **Compartments.** One wallet per position, derived from the seed.
- **Mist route.** Funding from other chains and private moves between compartments through NEAR Intents.
- **Shield.** Bundle-only submission to Jito block builders, with no silent fall back to public sending.
- **Scatter.** Buys split into random slices over a time window.
- **Relay.** Stateless server with a strict content policy, an image relay and two independent chart sources.

[Unreleased]: https://github.com/MISTTerminal/mist/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/MISTTerminal/mist/releases/tag/v0.1.0
