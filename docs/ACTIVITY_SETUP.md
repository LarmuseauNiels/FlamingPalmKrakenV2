# Discord Activity — Storefront Spike

The points storefront running as a Discord Activity: a web app Discord loads in
a sandboxed iframe, launchable from the app launcher or from a button.

This is a **spike**. Its job is to prove out the three things that are
genuinely new — iframe OAuth, the Discord proxy/CSP, and the deploy pipeline —
on top of an API that already works. The storefront itself is thin on purpose.

---

## What was added

| Path | Purpose |
|---|---|
| `modules/ApiFunctions/ActivityEndPoints.ts` | `/api/activity/config`, `/api/activity/token`, static hosting of the built SPA at `/` (and `/activity` as a debug alias) |
| `activity/` | Vite + TypeScript SPA (no framework) |
| `interactionHandlers/buttons/openStore.ts` | Launches the Activity from a button (`launchActivity()`) |
| `deploy-commands.ts` | Registers the entry point command when `ACTIVITY_ENABLED=true` |
| `captain-definition` | Builds `activity/dist` and copies it into the runtime image |

New environment variable: **`ACTIVITY_ENABLED`** — set to `true` once Activities
are switched on in the developer portal. Nothing else is needed; the token
exchange reuses `CLIENT_ID`, `OAUTHSECRET`, `GUILD_ID` and `JWT_SECRET`.

---

## Why the existing OAuth flow couldn't be reused

`WebApi.ts` authenticates through Passport's redirect flow: `/auth` bounces the
browser to Discord, Discord bounces back to `/login`, and that route signs the
JWT. An Activity has nowhere to bounce to — it's an iframe with no navigation.

So the Activity does this instead:

1. `discordSdk.commands.authorize()` opens Discord's own consent UI and returns
   an OAuth **code** to the page.
2. The page posts that code to `POST /api/activity/token`.
3. The server exchanges it for an access token, reads `/users/@me`, and signs
   **the same JWT shape** the website already uses.
4. The page calls `discordSdk.commands.authenticate({ access_token })` to unlock
   privileged SDK commands, and uses the JWT as a bearer token for `/members/*`.

Both flows now mint JWTs that `Helpers.authenticateToken` accepts, so every
existing member endpoint works from inside the Activity with no changes.

**Scope note:** the Activity only requests `identify`. Guild membership is
verified server-side by asking the bot (`guild.members.fetch`) rather than
trusting the `guilds` scope on the token — fewer scopes on the consent screen
and a more reliable answer.

---

## Developer portal setup

1. **Enable Activities.** Application → Activities → enable. Under *Settings*,
   set the supported platforms (web + mobile).
2. **URL Mappings.** Application → Activities → URL Mappings:

   | Prefix | Target |
   |---|---|
   | `/` | `kraken-bot.majesty.flamingpalm.com` (no `https://`) |

   **Discord loads the Activity from the root of that domain.** That is why the
   API serves the SPA at `/` rather than at `/activity` — one root mapping then
   covers the page, its assets *and* every `/members/…` and `/api/activity/…`
   call the page makes, with no prefix-rewriting to reason about.

   Because `/` is now the Activity, the uptime health check moved to
   **`/health`**. If you monitor the bot externally (UptimeRobot), repoint it.

   > **Symptom if this is wrong:** the Activity opens and shows
   > `{"uptime": …}` — that is the old health check answering at `/`, meaning
   > the deployed build predates this change or the mapping target is off.

3. **Images need no mapping.** The CSP blocks every host but our own, so the
   API fetches reward art and Discord avatars for the page
   (`/api/activity/images/reward/:id`, `/api/activity/images/avatar/:userId/:hash`).
   They ride on the same root mapping as everything else.

4. Set `ACTIVITY_ENABLED=true` in the CapRover app config and run
   `npm run deploy` to register the `/shop` entry point command.

---

## Local development

```bash
cd activity
npm install          # commit the resulting package-lock.json, then switch
                     # captain-definition to `npm --prefix activity ci`
npm run dev
```

Outside Discord there is no SDK to hand-shake with, so the page will stop at
"Connecting to Discord…". To exercise the UI against the real API, point it at
a deployed backend and stub the auth:

```bash
VITE_API_BASE=https://api.flamingpalm.com npm run dev
```

To test the real thing, run the dev server behind a public tunnel and set that
tunnel as the URL mapping target in the portal. `vite.config.ts` already allows
the `.discordsays.com` host.

---

## Things this spike deliberately did not do

- **CORS is still wide open.** `WebApi.ts` uses a bare `cors()`. Tightening it
  to the `discordsays.com` origin is the right follow-up, but it touches the
  Angular site's access too, so it shouldn't ride along with this change.
- **No `rpc.activities.write` scope**, so no `setActivity()` presence ("Shopping
  in the store" in the member list). Adding it means a second scope on the
  consent screen — worth it for Islander, not for a storefront.
- **Raid board is live by polling, not by SDK presence.** The Raids tab re-reads
  `GET /members/raids/:id/board` every 4s while it is on screen. It doesn't use
  `getInstanceConnectedParticipants` yet, so it can't highlight who is in the
  Activity right now.
- **Port mismatch untouched.** `WebApi.ts` listens on 3000 while
  `captain-definition` declares `ENV PORT 80` / `EXPOSE 80`. Presumably
  CapRover's container port setting bridges it — worth confirming before this
  serves static assets too.

---

## Deep links into the raid board

Scheduling DMs and the LFG "entered scheduling" message carry an **Open raid
board** link button (`RaidEmbeds.raidBoardUrl`):

```
https://discord.com/activities/<CLIENT_ID>?custom_id=raid-<raidId>
```

Discord passes `custom_id` to the Activity as `discordSdk.customId`; the Raids
tab (`features/raids.ts`) opens that raid's board on first mount, falling back
to the list if it can't load. When a member suggests a new time, attendees get
a short notice with this link plus a **Vote here instead** button
(`buttons/raidResendMenu.ts`) rather than a whole new voting menu each.

---

## Manual test checklist

- [ ] `npm run build` (bot) and `npm --prefix activity run build` both succeed
- [ ] `GET /api/activity/config` returns the client id
- [ ] `GET /` serves the SPA (not `{"uptime": …}`) and `GET /health` returns uptime
- [ ] `GET /activity/` serves the same SPA (debug alias)
- [ ] `/store` shows the "Open in Discord" button when `ACTIVITY_ENABLED=true`
- [ ] The app launcher lists `/shop` after `npm run deploy`
- [ ] Opening the Activity reaches the store grid without a CSP error in console
- [ ] Balance and stock are correct; redeeming deducts points and posts to the
      purchase channel, exactly as the website does
- [ ] A non-member of the guild gets 403, not a store
- [ ] "Open raid board" in a scheduling DM launches the Activity on that raid's board
