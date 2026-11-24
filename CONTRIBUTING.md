# Contributing

Thanks for looking. MIST is one Node.js program with no dependencies, and a browser client with no build step.

## Getting set up

```bash
git clone https://github.com/MISTTerminal/mist
cd mist
npm start            # http://localhost:8316
npm test             # end-to-end against live sources
```

Node 22 or newer.

## Where things live

- `client/wallet.js` holds every line that touches a key. Keep it small and free of network calls.
- `client/app.js` is the terminal. The order engine is `buy`, `sell`, `swap` and `routeMove`.
- `server/index.js` is the relay. It must stay stateless: no database, no log of requests, no cookies.
- `client/index.html`, `landing.css` and `landing.js` are the landing page.
- `test/run.js` is the end-to-end suite.

## Making a change

1. Branch from `dev`.
2. Keep the change small and add a check that fails without it.
3. Run `npm test`.
4. Open a pull request against `dev`, and say which tests you ran.

Two rules: the page may only talk to its own origin, and nothing the relay does may identify a visitor.

Security issues go through [private reporting](https://github.com/MISTTerminal/mist/security/advisories/new), not pull requests.
