# CLAUDE.md — FlamingPalmKrakenV2

AI assistant guide for the FlamingPalm Discord bot codebase.

---

## Project Overview

**FlamingPalmKrakenV2** is a Discord bot for the FlamingPalm gaming community. It provides:
- Raid/event scheduling and management
- Achievement and points system
- Member profiles with custom image generation
- Reward shop
- OpenAI-powered community assistant
- Web API with Discord OAuth for a companion website

**Stack:** TypeScript · Node.js 21 · Discord.js 14 · Prisma + MySQL · Express · OpenAI GPT-4o-mini · CapRover Docker deployment

---

## Repository Structure

```
FlamingPalmKrakenV2/
├── index.ts                  # Bot entry point
├── deploy-commands.ts        # Registers slash commands with Discord API
├── captain-definition        # CapRover Docker config (port 80, node:21-alpine)
├── tsconfig.json             # TypeScript config (ES2020, Node16, strict: false)
├── prisma/
│   ├── schema.prisma         # MySQL schema (25+ models)
│   └── migrations/           # Prisma migration history
├── components/
│   ├── FpgClient.ts          # Extended Discord.js Client — core hub class
│   └── Assistant.ts          # OpenAI GPT-4o-mini wrapper with tool-calling
├── events/                   # Discord.js event handlers (8 files)
├── interactionHandlers/
│   ├── commands/             # 21 slash command handlers
│   ├── buttons/              # 4 button interaction handlers
│   ├── selects/              # 1 select menu handler
│   ├── contextmenus/         # 3 right-click context menu handlers
│   └── disabledCommands/     # Archived/disabled commands (not loaded)
├── modules/
│   ├── RaidModule.ts         # Raid CRUD, attendance, subscriptions
│   ├── RaidScheduler.ts      # Automatic scheduling lifecycle
│   ├── RaidEmbeds.ts         # Discord embed builders for raids
│   ├── AchievementsModule.ts # Achievement tracking, profile image generation
│   ├── WebApi.ts             # Express server with Passport Discord OAuth
│   ├── statistics.ts         # Cron-based stat collection
│   ├── VintageStoryStatus.ts # Game server status monitoring
│   ├── NotificationLevels.ts # User notification preferences
│   └── ApiFunctions/         # Organized Express route handlers
│       ├── AdminEndPoints.ts
│       ├── MemberEndPoints.ts
│       ├── ProfileEndPoints.ts
│       ├── ShopEndPoints.ts
│       ├── LegacyEndPoints.ts
│       ├── Helpers.ts
│       └── ViewModels/       # DTOs (DashBoardModel, ShopItem, User, etc.)
├── interfaces/
│   ├── IHandler.ts           # Interface for all interaction handlers
│   └── IEvent.ts             # Interface for all event handlers
├── islander/
│   └── ChannelUpdates.ts     # Island game mechanics module
├── utils/
│   └── logger.ts             # Color-coded logger with Bugsnag integration
├── assets/                   # Images and badge files for profile generation
├── fonts/                    # TTF fonts used by @napi-rs/canvas
└── .github/workflows/
    └── codeql.yml            # CodeQL security scanning (push/PR to master)
```

---

## Key Architectural Patterns

### Handler Pattern
Every slash command, button, select menu, and context menu implements `IHandler`:
```typescript
interface IHandler {
  name: string;
  data: SlashCommandBuilder | ...; // Discord.js builder
  execute(interaction: Interaction, client: FpgClient): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction, client: FpgClient): Promise<void>;
}
```
Handlers are **dynamically loaded** by `FpgClient` from their directories at startup. To add a new command, create a file in `interactionHandlers/commands/` that exports a default object implementing `IHandler`.

### Event Pattern
Every event implements `IEvent`:
```typescript
interface IEvent {
  name: string;  // Discord.js event name
  once?: boolean;
  execute(...args: any[]): Promise<void>;
}
```
Events are dynamically loaded from `events/`. Use `once: true` for one-shot events like `clientReady`.

### Module Pattern
Business logic lives in static classes inside `modules/`. The Prisma client is accessed via `global.client.prisma` (set in `FpgClient`). Example:
```typescript
// Access the global client inside modules/events
const raids = await global.client.prisma.raids.findMany(...);
```

### Global Client
`global.client` is the `FpgClient` singleton (extends `Client`). It holds:
- `client.prisma` — Prisma client instance
- `client.commands` — Map of slash commands
- `client.buttons` — Map of button handlers
- `client.selects` — Map of select menu handlers
- `client.contextMenus` — Map of context menu handlers
- `client.loggingChannels` — Mod log channel references
- `client.cachedEvents` — Events cache for website API

---

## Development Workflow

### Prerequisites
- Node.js 21
- MySQL database
- Copy `.env.example` → `.env` and fill required variables

### Required Environment Variables
| Variable | Purpose |
|---|---|
| `TOKEN` | Discord bot token |
| `CLIENT_ID` | Discord application ID |
| `GUILD_ID` | Discord server (guild) ID |
| `DATABASE_URL` | MySQL connection string |
| `OAUTHSECRET` | Discord OAuth client secret |
| `CALLBACK_URL` | OAuth redirect URL |
| `JWT_SECRET` | JWT signing secret |
| `OPENAI_API_KEY` | OpenAI API key |
| `BUGSNAG_API_KEY` | Bugsnag error tracking key |
| `LOG_LEVEL` | Logger level: DEBUG, INFO, WARN, ERROR |
| `DISABLE` | Set to skip startup (optional) |
| `CAPROVER_GIT_COMMIT_SHA` | Version tracking (optional) |

### Scripts
```bash
npm run build    # Compile TypeScript → ./bin/
npm start        # Run compiled bot (./bin/index.js)
npm run deploy   # Build + register slash commands with Discord
```

> **Note:** There is no test suite — tests were removed in a previous refactor. `tsconfig.test.json` is a leftover artifact.

### Database
```bash
npx prisma migrate dev    # Run migrations in development
npx prisma generate       # Regenerate Prisma client after schema changes
npx prisma studio         # Open Prisma Studio GUI
```

Always run `npx prisma generate` after editing `prisma/schema.prisma`.

### Deployment
The project deploys via **CapRover** using the `captain-definition` file. The Docker image:
1. Uses `node:21-alpine`
2. Installs Manrope fonts
3. Compiles TypeScript
4. Exposes port 80 for the Express web API

---

## Code Conventions

### Naming
- **Files/commands:** kebab-case (`create-raid.ts`, `add-attendee.ts`)
- **Classes:** PascalCase (`FpgClient`, `RaidModule`, `CreateRaidCommand`)
- **Methods/variables:** camelCase
- **Handler `name` property:** must exactly match the Discord command/button/select custom ID

### TypeScript
- `strict: false` — type checks are lenient; don't break existing JS-style patterns
- Target: ES2020, module resolution: Node16
- Global declarations for `client` and `bugsnag` are in `index.ts`
- Use `allowJs: true` — some modules (e.g., `profile.js`) are plain JavaScript

### Error Handling
Always use the custom logger, not `console.log`:
```typescript
import logger from '../utils/logger';

try {
  // ...
} catch (error) {
  logger.error('Context description', error);
  // Automatically reports to Bugsnag in production
}
```
All async operations must be wrapped in try/catch. Never let promises fail silently:
```typescript
someAsyncOp().catch(err => logger.error('op failed', err));
```

### Interaction Replies
Always reply to interactions — Discord requires a response within 3 seconds:
```typescript
await interaction.deferReply({ ephemeral: true }); // for long operations
// ... do work ...
await interaction.editReply({ content: '...' });
```

### Adding a New Slash Command
1. Create `interactionHandlers/commands/my-command.ts`
2. Export a default object implementing `IHandler` with `data` built using `SlashCommandBuilder`
3. Run `npm run deploy` to register the command with Discord

### Adding a New Button Handler
1. Create `interactionHandlers/buttons/my-button.ts`
2. Export a default object implementing `IHandler` where `name` matches the button's `customId`
3. No deploy step needed — buttons are matched by `customId` at runtime

---

## Key Files Reference

| File | Purpose |
|---|---|
| `index.ts` | Bot startup, Bugsnag init, loads FpgClient |
| `deploy-commands.ts` | Registers/updates slash commands via Discord REST API |
| `components/FpgClient.ts` | Core client: loads all handlers, holds all collections |
| `components/Assistant.ts` | OpenAI thread management and tool-calling |
| `events/interactionCreate.ts` | Routes all interactions to the correct handler |
| `events/clientReady.ts` | Post-login setup: channels, invites, event cache |
| `modules/RaidModule.ts` | All raid database operations |
| `modules/RaidScheduler.ts` | Scheduling lifecycle (polls → scheduling → confirmation) |
| `modules/RaidEmbeds.ts` | All raid-related Discord embeds |
| `modules/AchievementsModule.ts` | Achievement logic + canvas profile image generation |
| `modules/WebApi.ts` | Express app, Passport OAuth, JWT auth middleware |
| `modules/ApiFunctions/` | Route handlers organized by domain |
| `utils/logger.ts` | All logging — use this everywhere |
| `prisma/schema.prisma` | Source of truth for all database models |

---

## Database Models (Prisma)

Key models and their purpose:

| Model | Purpose |
|---|---|
| `Members` | Discord member profiles |
| `Points` | Current point balances |
| `PointHistory` | Audit trail of point changes |
| `Achievements` | Achievement definitions |
| `Achievement_History` | Member achievement records |
| `Raids` | Raid events |
| `RaidAttendees` | Raid sign-ups |
| `RaidAvailability` | Time availability votes |
| `RaidSchedulingOption` | Time options for scheduling polls |
| `Reward` / `RewardItem` | Shop rewards and redemptions |
| `Channel` | Tracked Discord channels |
| `Presence` | Game activity tracking |
| `i_Island` / `i_Building` / `i_Unit` | Island game mechanics |
| `Login_History` | Web login audit trail |

---

## CI/CD

- **CodeQL** runs automatically on push/PR to `master` (`.github/workflows/codeql.yml`)
- No automated test pipeline (tests were removed)
- Deployment is manual via CapRover git push

---

## Common Pitfalls

1. **Forgetting `npm run deploy`** after adding/changing slash commands — the bot won't see new commands until they're registered with Discord.
2. **Editing `schema.prisma` without `npx prisma generate`** — the Prisma client won't reflect changes.
3. **Not deferring long interactions** — Discord times out after 3 seconds; always `deferReply` before async DB work.
4. **Using `console.log` instead of `logger`** — errors won't reach Bugsnag in production.
5. **Handler `name` mismatches** — the `name` in a handler must exactly match the Discord command name or button `customId`.
6. **`disabledCommands/` directory** — files here are intentionally not loaded; don't move files there expecting them to work.
