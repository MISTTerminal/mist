# MIST

[![license](https://img.shields.io/badge/license-MIT-a78bfa)](LICENSE) [![node](https://img.shields.io/badge/node-%E2%89%A5%2022-a78bfa)](.node-version) [![dependencies](https://img.shields.io/badge/dependencies-0-a78bfa)](package.json) [![checks](https://img.shields.io/badge/end--to--end%20checks-52-a78bfa)](test)

**[mistterminal.xyz](https://mistterminal.xyz)** · [Terminal](https://mistterminal.xyz/app) · [Docs](https://mistterminal.xyz/docs) · [Changelog](CHANGELOG.md) · [Security](SECURITY.md)

The private trading terminal for Solana. Every position sits in its own wallet, and no wallet can be followed back to the one that funded it.

- **Discover.** Trending, new pairs and top gainers, with live charts and a trade tape for any Solana token.
- **Compartments.** A fresh wallet per position, derived in the browser from one encrypted seed.
- **Mist route.** Compartments are paid through NEAR Intents from the route's own wallet, from any supported chain or from your own Reserve.
- **Shield.** Orders go to Jito block builders as bundle-only transactions, out of sight of sandwich bots.
- **Scatter.** One buy split into random slices over a time window.
- **Relay.** The browser talks to this server only. No accounts, no cookies, no request log, no database.

One Node.js program, no dependencies.

## Quick start

```bash
git clone https://github.com/MISTTerminal/mist
cd mist
npm start          # http://localhost:8316
npm test           # 52 end-to-end checks against live sources
```

Node 22 or newer.

## How it fits together

```
browser tab                          relay (server/index.js)              the outside
  vault, keys, signing  ──signed tx──▶  stateless, no log   ──────────▶  Solana RPC, Jito, market data, NEAR Intents
  (client/wallet.js)   ◀── quotes ────  last-good cache    ◀──────────
```

| Path | What it is |
|---|---|
| `client/wallet.js` | Vault (PBKDF2 + AES-256-GCM), compartment key derivation, Ed25519 signing with WebCrypto, hand-built transfers |
| `client/app.js` | The terminal: discover, token page, chart, order engine, compartments, activity |
| `server/index.js` | The relay: market data, quotes, images, transaction relay, the route |
| `client/landing.js` | Landing hero |
| `test/run.js` | End-to-end checks |

## Keys

Keys never reach the server. A 32-byte seed is generated in the tab and encrypted with a key stretched from the passphrase (PBKDF2-SHA256, 310,000 rounds, AES-256-GCM). Compartment `n` uses the Ed25519 key `HMAC-SHA256(seed, "mist/compartment/n")`. Transactions are signed in the tab and arrive at the relay already signed.

## Configuration

All optional, read from the environment.

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (default 8316) |
| `RPC_URL` | Comma-separated Solana RPC endpoints |
| `JITO_URL` | Block engine transactions endpoint |
| `TOKEN_MINT` | $MIST contract address shown on the site |
| `X_URL`, `GH_URL` | Links shown in the landing page nav |
| `FEE_BPS`, `FEE_ACCOUNT` | Swap fee in basis points and the token account that receives it |
| `ROUTE_FEE_BPS`, `ROUTE_FEE_TO` | Route fee and its NEAR recipient |

## Tests

`npm test` runs 52 checks against live sources: every page and its content policy, market data, the vault, the route, and signature verification of wallet-signed transactions by a Solana node (the node checks them without broadcasting; no funds are needed).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Security reports go through [private reporting](https://github.com/MISTTerminal/mist/security/advisories/new).

## License

[MIT](LICENSE)
