# PartyDeck

PartyDeck is a shared game-night lobby built with Next.js and a single long-running Node.js server. It does not use a database. The server saves lobby snapshots in a JSON file and shares live updates over Socket.IO.

## What works

- Create a lobby with a secure, random short code.
- Join the same lobby from another device using its code or invitation link.
- See the same player list, host, player limit, and approval status on connected devices.
- Reconnect with a private HTTP-only guest-session cookie after refresh or a temporary disconnect.
- Change the player limit as host; changing it clears everyone’s approvals.
- Save lobbies to a JSON file. On a host with persistent disk, lobbies survive app restarts and expire after 48 hours without activity.
- The poker hand evaluator is a separate module with focused unit tests.

Poker betting and dealing, the end-of-night settlement, and the other games are not implemented yet. They are labelled as not playable in the UI. The lobby foundation is ready for those game modules.

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm ci`.
3. Run `npm run dev` and open http://localhost:3000.

The local state file is `data/lobbies.json` and is ignored by Git. Set `PARTYDECK_STATE_FILE` to choose a different path and `PORT` to change the listening port.

## Deploy

PartyDeck now needs a single long-running Node.js server. The current Vercel serverless deployment cannot host this in-memory Socket.IO room manager and share its state reliably across separate function instances. Deploy this repository to a single-instance Node host instead; `railway.json` configures the build, start command, and health check for Railway.

For state to survive a restart or redeploy, attach persistent disk storage to the host and set:

```text
PARTYDECK_STATE_FILE=/data/lobbies.json
```

Keep the service to one running instance. Multiple instances do not share the JSON file or live Socket.IO rooms. This is the tradeoff for avoiding a database/Redis. Back up the volume if lobby history matters.

The deploy command is `npm start`; the server listens on the host-provided `PORT`. The built-in health check is `/api/health`.

## Security and limitations

- Guest tokens are generated with cryptographic randomness, stored only as SHA-256 hashes in the state file, and delivered in `HttpOnly`, `SameSite=Lax` cookies.
- All lobby mutations are validated by the server. The public snapshot omits reconnect-token hashes.
- Only same-origin Socket.IO connections are accepted.
- This app does not process payments or real-money transactions.
- A single JSON file is suitable for a small game night, not a large multi-instance production service. File storage is not a database: writes are local to the server’s attached volume and there is no cross-region replication.

## Checks

Run `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build`. Tests cover hand ranking helpers and shared lobby creation, joins, persistence, approvals, and capacity rules.
