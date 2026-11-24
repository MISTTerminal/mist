# Security

The code that matters most is the key path in `client/wallet.js` (vault encryption, key derivation, signing) and the relay's promise to store nothing in `server/index.js`.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository: [report a vulnerability](https://github.com/MISTTerminal/mist/security/advisories/new). Include the steps to reproduce and what you observed. Please do not open a public issue for anything in the list below.

You will get an acknowledgement within 72 hours and a fix or a written assessment within 14 days.

## In scope

- Any way for a seed, passphrase or private key to leave the browser tab
- Signing a transaction the user did not ask for, or one built for a different wallet
- Weaknesses in the vault encryption or the compartment key derivation
- The page loading or contacting anything outside its own origin (a content policy bypass)
- The relay keeping or exposing addresses, requests or any per-visitor record
- An order marked Shield being sent the public way
- Request forgery through the image relay, or crashing the relay from the public API

## Supported versions

The `main` branch and the latest tag.
