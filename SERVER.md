# Dead Rails Frontier: running the multiplayer server

The game is plain browser JavaScript (ES modules, three.js). Online play needs one small Node.js server, in
`server/`. It runs [Colyseus](https://colyseus.io) 0.15 and also serves the game itself, so players open the
server's address in their browser and everything comes from one place.

Without the server, the game still works exactly as before: on your own, or with other tabs of the same browser.

## What you need

- **Node.js 18.17 or newer** (20 LTS recommended).
- A host that keeps a Node process running and allows **WebSockets**. Plain static hosting (GitHub Pages, Netlify
  without functions, the Dia preview) can't run it.
- No database, no credentials and no environment variables are required for this stage.
- Internet access from the server on first start: it fetches the same three.js the game uses (if it can't, it
  falls back to the `three` package it installed).

## Run it on your own computer

From this folder (the one with `package.json` and `index.html`):

```
npm install
npm start
```

Then open **http://localhost:2567** in two different browsers (or one normal window and one private window, so
each has its own player profile), and:

1. In the first, pick **Create server** → Public → *Create and ride in*.
2. In the second, open **Public servers**, refresh, and join it. Or use **Quick join**.
3. For a private server, create one with *Private*, press **Esc → Server & invites** to see the code, and use
   **Join with code** in the other browser.

To let someone on your network join, give them `http://<your computer's IP>:2567`.

## Put it online

Any Node host with WebSockets works. Two easy ones:

- **Render** (Web Service) or **Railway**: connect the repository (or upload this folder), build command
  `npm install`, start command `npm start`. They set `PORT` for you and give you an `https://` address; the game
  then connects over `wss://` automatically.
- **A VPS** (DigitalOcean, Hetzner, Lightsail): install Node 20, copy this folder, run `npm install` then
  `npm start` under a process manager (`pm2 start server/index.js`), and put it behind nginx or Caddy for HTTPS.
  The proxy must pass WebSocket upgrades through.

Optional environment variables:

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `2567` | Port the server listens on |
| `REGION` | `Local` | Shown in the server list as the connection region (e.g. `Sydney`) |

If you host the game files somewhere else, open the game, choose **Server address…** under the menu and enter the
server's `https://` address.

## What the server decides

- **The shared world:** every loot container, the train's storage, items on the ground, death bags, and the
  train's fuel, condition, upgrades, defences and driver's seat. It runs the same rules file the game uses
  (`js/game/authority.js`) in strict mode:
  - container sizes and loot come from the rules, not from the request;
  - items must exist in the catalogue, in sensible amounts, and can't be duplicated;
  - you have to be within about 9 m of a container to open it, or of a spot to drop something.
- **Who gets in:**
  - private and friends servers never appear in the list;
  - the invitation code is checked by the room on join, and code guesses are rate-limited per address;
  - removed players can't come back;
  - you only need the code once per server.
- **Movement:**
  - positions that move faster than about 95 m/s are refused (one long jump every 20 s is allowed, for map travel
    and respawns);
  - nearby players are sent 10 times a second and distant ones once a second.
- **Train motion:** only the driver (or, with no driver, the player who has been in longest) can move the train,
  and everyone sees the same position.
- **Rate limits:** every kind of message has its own limit.
- **Reconnecting:**
  - a dropped player's place is kept for 30 s and the game reconnects on its own;
  - reloading the page offers **Rejoin**;
  - joining twice with the same profile replaces the old connection, so you never get a duplicate character.
- **Shutting down:** stopping the server (Ctrl+C, or the host restarting) tells everyone the server closed.

## Not done yet (later stages)

- **Lobby, parties and friends (stages 3 and 6):**
  - the spawn lobby settlement isn't built; everyone starts in Dry Gulch as before;
  - there's no party or friend system. *Friends sessions* plus their code stand in for now.
- **Still in the player's browser (stages 8 and 9):**
  - your saddlebag, health, survival stats and cash are still kept there, so a modified client could still cheat
    with its own items;
  - moving them to the server is the next security step;
  - there are no accounts or passwords yet; a random profile id kept in each browser identifies the player.
- **Not shared yet:** zombies, day and night (the hour keys still work per player), and story progress. Each player
  currently has their own. Weather already matches because it's worked out from the clock.
- **No saving across restarts:** worlds live in memory, so restarting the server ends every session. Saving them to
  disk or a database comes with profiles.
- **One server process:** codes and rooms live in memory, which is fine for a few hundred players. Spreading across
  several processes would need Colyseus's Redis presence.

None of this has been run yet. It was written without the ability to install packages or start a server, so expect to
fix small things on the first `npm start`.
