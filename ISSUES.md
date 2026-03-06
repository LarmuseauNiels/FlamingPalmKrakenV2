# Technical Issues & Depth Analysis

*Generated: 2026-03-06*

---

## Summary

This document catalogs the issues found across the FlamingPalmKrakenV2 codebase, organized by severity, along with observations on technical depth.

---

## Critical Issues

### 1. Race Condition in Shop Redemption (`ShopEndPoints.ts:82–148`)
The `redeemItem` endpoint uses two separate, non-atomic database operations: it first calls `findFirst` to locate an available item, then later calls `update` to claim it. Between those two operations another concurrent request can claim the same item, causing double-redemption (one user gets the item for free, another has their points deducted with nothing to show for it). This is a classic Time-of-Check / Time-of-Use (TOCTOU) bug.

**Fix:** Wrap both the `rewardItem.update` and `points.update` calls in a `prisma.$transaction(...)`, or use an atomic `updateMany` with `where: { RewardItemID: ..., RedeemedBy: "" }` and check the count.

---

### 2. Crash on Startup When `CAPROVER_GIT_COMMIT_SHA` Is Unset (`index.ts:13`, `clientReady.ts:33`)
```typescript
appVersion: process.env.CAPROVER_GIT_COMMIT_SHA.slice(0, 7),
```
If `CAPROVER_GIT_COMMIT_SHA` is not set (documented as "optional" in CLAUDE.md), this throws `TypeError: Cannot read properties of undefined (reading 'slice')`, crashing the bot before it starts. The same issue recurs in `clientReady.ts:33`.

**Fix:** Use `process.env.CAPROVER_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'`.

---

### 3. JWT Tokens Never Expire (`WebApi.ts:68–76`)
```typescript
let token = jwt.sign({ id, username, avatar }, process.env.JWT_SECRET);
```
`jwt.sign` is called without an `expiresIn` option. Tokens are valid forever. A stolen token can never be invalidated short of changing `JWT_SECRET` (which invalidates all users).

**Fix:** Add `{ expiresIn: '7d' }` (or another appropriate duration) as the options argument.

---

### 4. OpenAI Assistant Leaks on Every Bot Restart (`Assistant.ts:19–67`)
`setupAssistant()` calls `openai.beta.assistants.create(...)` unconditionally on every startup. Every deployment or crash-restart creates a new orphaned Assistant object in OpenAI's API. These accumulate silently and continue to incur storage/API costs.

**Fix:** Store the assistant ID in an environment variable (e.g., `OPENAI_ASSISTANT_ID`). On startup, call `assistants.retrieve(id)` if set, and only create a new one if not. Persist the resulting ID.

---

### 5. Shared Thread State Across Concurrent Messages (`Assistant.ts:8–9`, `72`)
`this.thread` is a single instance variable. If two users mention the bot simultaneously, the second `ask()` call overwrites `this.thread` before the first run has completed, causing the first user's response to be fetched from the wrong thread (or an error).

**Fix:** Make `thread` a local variable inside `ask()` and pass it down explicitly to `createAndPollRun()` and `handleCompletedRun()`.

---

## High Issues

### 6. No Authorization on Admin Web Endpoint (`AdminEndPoints.ts:11–19`)
`/admin/yearOverview` is protected only by `authenticateToken`, which verifies the JWT but **does not check any role or privilege**. Any authenticated Discord user (even non-admins) can call this endpoint and receive full voice-activity statistics for the entire server year.

**Fix:** Add an admin-role check, e.g., verify that `req.user.id` is in a known admin list or fetch the user's Discord guild roles via the API and check for the Administrator permission.

---

### 7. CORS Allows All Origins (`WebApi.ts:49`)
```typescript
app.use(cors());
```
With no configuration, CORS allows any origin to make credentialed requests to the API. This means any external website can trigger authenticated requests on behalf of users who have a valid JWT stored in their browser.

**Fix:** Restrict allowed origins: `cors({ origin: process.env.CORS_ORIGIN })`.

---

### 8. `logDiscordLogin` Crashes for New Users (`WebApi.ts:110–117`)
```typescript
await global.client.prisma.members.update({ where: { ID: profile.id }, ... });
```
`prisma.members.update` throws `RecordNotFound` if the member doesn't exist in the database yet. This causes the entire OAuth login flow to error out for first-time users. The outer `.catch()` only logs the error — the user may or may not receive a JWT depending on where in the promise chain the error propagates.

**Fix:** Use `upsert` instead of `update` (matching the pattern used in `guildMemberAdd.ts`).

---

### 9. Duplicate Scheduling Messages Race Condition (`RaidScheduler.ts:22–68`)
`SchedulingCreationCheck` is called every time a user joins a raid (`RaidModule.ts:28`). If two users join simultaneously when the raid is at `MinPlayers - 1`, both async calls can independently observe `attendees.length >= MinPlayers` and both will update the status to `2` and send scheduling messages/options, resulting in duplicate DMs and doubled scheduling options for all attendees.

**Fix:** Use an atomic `updateMany` with a conditional — only proceed if the current status is still `1`:
```typescript
const result = await prisma.raids.updateMany({
  where: { ID: raidId, Status: 1, /* attendee count check via subquery */ },
  data: { Status: 2 }
});
if (result.count === 0) return; // another call already handled it
```

---

### 10. `submitToolOutputs` Returns `undefined` on Error (`Assistant.ts:255–265`)
If `submitToolOutputsAndPoll` throws, the `catch` block logs the error but **returns `undefined`** implicitly. The caller `handleRequiresAction` then passes that `undefined` to `handleRunStatus(run)`, which will throw `TypeError: Cannot read properties of undefined` when accessing `run.status`.

**Fix:** Return the error response object in the catch block:
```typescript
catch (error) {
  log.error("Error submitting tool outputs:", error);
  return [{ content: [{ text: { value: "Sorry, an error occurred." } }] }];
}
```

---

### 11. `FpgClient.log()` Crashes During Early Startup (`FpgClient.ts:72–75`)
```typescript
log(loggText) {
  logger.info(loggText);
  this.logChannel.send("```" + loggText + "```");
}
```
`logChannel` is set in the `clientReady` event. Any call to `client.log(...)` before that event fires (e.g., from constructor or early module load errors) will throw `TypeError: Cannot read properties of undefined`.

**Fix:** Add a null guard: `this.logChannel?.send(...)`.

---

### 12. Scheduling Vote Collection Is Brittle and Slow (`RaidScheduler.ts:266–309`)
Vote collection works by fetching the last **50 DM messages** and searching for the bot's scheduling message by its content (`raid.ID.toString()`). This fails if:
- The user has received more than 50 DMs since the scheduling message was sent.
- The DM was deleted by the user.
- The bot can't read the DM channel.

Additionally, DMs are fetched serially per attendee in `Promise.all` — but each fetch triggers an API call, making this O(n × m) in attendees × options. With 10+ attendees this easily hits Discord rate limits.

**Fix:** Store the scheduling message ID in the database (add a `SchedulingMessageId` column to `RaidSchedulingOption` or `Raids`) so it can be fetched directly.

---

## Medium Issues

### 13. Presence and VoiceConnected Tables Grow Unbounded
Every 15 minutes, new rows are inserted into `Presence` and `VoiceConnected` for all active members. There is no archival, rotation, or deletion logic. Over months/years these tables will contain tens of millions of rows, degrading write and query performance across the entire database.

**Fix:** Add a periodic cleanup cron job that deletes rows older than a retention window (e.g., 90 days), or use table partitioning.

---

### 14. Hardcoded Channel IDs and User IDs Scattered Throughout

| File | Line | Hardcoded Value | Purpose |
|---|---|---|---|
| `clientReady.ts` | 21, 24, 27 | `1126413976155205713`, `1194590523277725716`, `1221531160568659968` | Log, update, LFG channels |
| `statistics.ts` | 85 | `1128264365854961766` | Excluded voice channel |
| `statistics.ts` | 170 | `1128266086119374848` | Announcements channel |
| `ShopEndPoints.ts` | 165 | `1128264366182125664` | Purchase notification channel |
| `AchievementsModule.ts` | 237 | `530537522921734178` | Daily login voice channel |
| `AchievementsModule.ts` | 255 | `178435947816419328` | Bot user ID |
| `guildMemberAdd.ts` | 116 | `14` | Referral achievement ID |

None of these are documented as environment variables. If channels are ever recreated or the bot is deployed to a different server, these silently break.

**Fix:** Move all IDs to environment variables (e.g., `CHANNEL_LOG`, `CHANNEL_LFG`, `CHANNEL_ANNOUNCEMENTS`, etc.).

---

### 15. Achievement Points Not Transactional (`AchievementsModule.ts:26–65`)
`achievement_History.create` and `points.update` are two separate `await` calls with no transaction wrapper. If `points.update` fails (e.g., the member has no `Points` record), the achievement history row is already written — the member earned the achievement but received no points. The state is permanently inconsistent.

**Fix:** Wrap both operations in `prisma.$transaction([...])`.

---

### 16. Raw SQL Session Variables Break with Connection Pooling (`AchievementsModule.ts:140–150`)
The `GetLoginStreak` method uses MySQL session variables (`@streak`, `@days_diff`) in a `$queryRaw` call. Prisma uses a connection pool — the session variables from one query can leak to another query running on the same connection from a different context, producing incorrect streak values. MySQL session variables are inherently unsafe with connection pools.

**Fix:** Rewrite the streak query using window functions (available in MySQL 8+) or application-side logic using a sorted list of `Achievement_History` timestamps.

---

### 17. `discriminator` Field Is Deprecated (`guildMemberAdd.ts:63`)
```typescript
value: `${GuildMember.user.username}#${GuildMember.user.discriminator}`,
```
Discord's username migration removed discriminators; they now return `"0"` for migrated accounts. Logged values look like `"someuser#0"`.

**Fix:** Use `GuildMember.user.tag` (which handles both old and new format) or just `GuildMember.user.username`.

---

### 18. No Rate Limiting on the Web API
The Express API has no rate-limiting middleware. Authenticated endpoints (especially `redeemItem` and `points`) are vulnerable to brute-force and automated abuse. An attacker with a valid JWT could hammer the API without any throttling.

**Fix:** Add `express-rate-limit` middleware, at minimum on shop/redemption endpoints.

---

### 19. `isGuild` Property Declared but Never Checked (`admin.ts:85`)
`admin.ts` declares `isGuild = true` but `interactionCreate.ts` and `FpgClient.ts` never read this property. The intent appears to be to prevent DM use of guild-only commands, but that guard is never enforced.

**Fix:** Either remove the dead property, or add a check in `handleCommand` in `interactionCreate.ts` that replies with an error for DM interactions when `isGuild === true`.

---

### 20. `MEMES_CHANNEL` Environment Variable Not Documented (`messageCreate.ts:11`)
`process.env.MEMES_CHANNEL` is used but not listed in the required environment variables in `CLAUDE.md`. If unset, the comparison `message.channelId === undefined` silently never matches, and meme reactions are quietly disabled with no warning.

**Fix:** Document it in `CLAUDE.md` and add a startup check.

---

## Low / Code Quality Issues

### 21. `body-parser` Is a Redundant Dependency (`WebApi.ts:13`)
`body-parser` is explicitly listed as a dependency and imported, but since Express 4.16.0 (released 2017), `express.json()` and `express.urlencoded()` are built in. This adds an unnecessary package.

**Fix:** Replace `bodyParser.json()` with `express.json()` and `bodyParser.urlencoded(...)` with `express.urlencoded(...)`, then remove `body-parser` from `package.json`.

---

### 22. Mixed `global.client` vs `globalThis.client` (`RaidModule.ts`, `Assistant.ts`, etc.)
Both `global.client` and `globalThis.client` are used interchangeably throughout the codebase. While they are equivalent in Node.js, the inconsistency adds confusion.

**Fix:** Pick one convention (prefer `global.client` for consistency with the declaration in `index.ts`) and apply it uniformly.

---

### 23. `global.bugsnag` Not Typed (`index.ts`, `interactionCreate.ts`)
`global.bugsnag` is assigned but only `global.client` has a type declaration. Every use of `global.bugsnag` is implicitly `any`, losing all type safety.

**Fix:** Add `var bugsnag: typeof Bugsnag;` to the `declare global` block in `index.ts`.

---

### 24. Duplicate Index on `VoiceConnected.ID` (`schema.prisma:115–116`)
```
@@index([ID], map: "VoiceConnected_ID_index")
@@index([ID], map: "index_name")
```
Two separate single-column indexes on the same `ID` field. MySQL will use only one; the other wastes disk space and slows writes.

**Fix:** Remove `@@index([ID], map: "index_name")` and create a migration.

---

### 25. `Achievements` Fields Are All Nullable Without Good Reason (`schema.prisma:218–227`)
`Name`, `Description`, `Type`, `Minimum` are all `String?` / `Int?` (nullable), but logically an Achievement must have a name and description to be useful. Nullable fields cause defensive null checks throughout business logic.

**Fix:** Make `Name`, `Description`, and `Type` non-nullable (add a migration with default values).

---

### 26. Achievement Badge Unlocks Use Magic Numbers (`AchievementsModule.ts:308–322`)
```typescript
if (achievements.filter((a) => a.AchievementID == 1).length > 5) { ... }
```
Achievement IDs 1, 11, 16, and 18 are used directly. There are no constants, comments, or enums explaining what these are. Any database refactor silently breaks badge unlocks.

**Fix:** Define named constants or an enum, or look up achievements by `Type`/`Name` string from the database.

---

### 27. Profile Background/Badge Paths Built with String Concatenation (`AchievementsModule.ts:188–213`)
```typescript
rank.setBackground("IMAGE", "assets/" + member.Profile.BackgroundImage + ".png");
```
If `BackgroundImage` contains `../` or other path traversal characters (it comes from the database, potentially user-controlled via the profile API), this could resolve to unexpected file paths. While it's unlikely to be exploitable given the canvas rendering context, it's bad practice.

**Fix:** Sanitize the value (e.g., `path.basename(member.Profile.BackgroundImage)`) before constructing the path.

---

### 28. Commented-Out Code Left in Production (`AchievementsModule.ts:274–300`)
A large block of BattleBit squad-size achievement logic is commented out with `/*...*/` and left in place, including an unfinished `propertyToGroupBy` placeholder. This is dead code that adds noise and hints at unfinished features.

**Fix:** Remove the block or move it to a feature branch.

---

## Technical Depth Assessment

### Strengths
- **Clean handler/event pattern** — dynamic loading from directories is well-structured and makes adding new commands straightforward.
- **Prisma ORM** — good use of relations, includes, and migrations. The schema is detailed and production-appropriate.
- **Centralized logging** — `utils/logger.ts` is a clean, consistent abstraction with Bugsnag integration. Most modules use it correctly.
- **OpenAI tool-calling integration** — `Assistant.ts` demonstrates a real multi-tool agentic loop (getEvents, getRaids, getStore) with proper `createAndPoll` + `submitToolOutputsAndPoll` pattern.
- **Profile image generation** — `@napi-rs/canvas` integration for custom profile cards is a sophisticated feature.
- **Raid scheduling lifecycle** — the multi-step flow (open → scheduling → scheduled → cancelled) with DM-based voting is architecturally interesting.

### Weaknesses
- **No tests** — acknowledged in CLAUDE.md; there is literally zero automated coverage. Any regression requires manual testing.
- **Global mutable singleton** — `global.client` is a single shared mutable object referenced directly throughout all modules. This makes unit testing impossible and creates tight coupling.
- **Weak TypeScript usage** — `strict: false`, heavy use of `any` (especially in interaction handlers and Assistant), `declare` without initialization guarantees. TypeScript is providing minimal safety benefits.
- **Business logic in Express route handlers** — shop redemption, point deduction, and Discord notifications are all inline in `ShopEndPoints.ts` rather than in a service layer. This makes the logic hard to reuse or test.
- **No environment validation on startup** — missing required env vars (e.g., `MEMES_CHANNEL`, `OPENAI_API_KEY`, `JWT_SECRET`) are discovered at runtime when they cause failures, not at startup.
- **No database query optimization strategy** — presence/voice data is inserted every 15 minutes for all members with no archival, which will cause performance degradation at scale.
