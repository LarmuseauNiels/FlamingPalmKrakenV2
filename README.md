# FlamingPalmKrakenV2

A Discord bot for the FlamingPalm gaming community, providing raid scheduling, achievement tracking, member profiles, a reward shop, an AI-powered assistant, and a companion web API.

## Features

- **Raid/Event Scheduling** — Create, manage, and automate raid events with attendance tracking and scheduling polls
- **Achievements & Points** — Track member achievements and point balances with a full audit trail
- **Member Profiles** — Custom profile image generation using canvas
- **Reward Shop** — Points-based reward redemption system
- **AI Assistant** — OpenAI GPT-4o-mini powered community assistant with tool-calling
- **Web API** — Express server with Discord OAuth for a companion website
- **Game Server Status** — Vintage Story server monitoring

## Stack

- **Runtime:** Node.js 21
- **Language:** TypeScript (ES2020)
- **Discord:** Discord.js 14
- **Database:** MySQL via Prisma ORM
- **Web:** Express + Passport (Discord OAuth) + JWT
- **AI:** OpenAI GPT-4o-mini
- **Image Generation:** @napi-rs/canvas
- **Deployment:** CapRover (Docker, node:21-alpine)
- **Error Tracking:** Bugsnag

## Prerequisites

- Node.js 21
- MySQL database

## Setup

1. **Clone the repository**

   ```bash
   git clone <repo-url>
   cd FlamingPalmKrakenV2
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy `.env.example` to `.env` and fill in the required values:

   ```bash
   cp .env.example .env
   ```

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
   | `LOG_LEVEL` | Logger verbosity: `DEBUG`, `INFO`, `WARN`, `ERROR` |
   | `DISABLE` | Set to skip startup (optional) |
   | `CAPROVER_GIT_COMMIT_SHA` | Version tracking (optional) |

4. **Run database migrations**

   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

5. **Register slash commands with Discord**

   ```bash
   npm run deploy
   ```

6. **Start the bot**

   ```bash
   npm start
   ```

## Scripts

| Command | Description |
|---|---|
| `npm run build` | Compile TypeScript to `./bin/` |
| `npm start` | Run the compiled bot |
| `npm run deploy` | Build and register slash commands with Discord |

## Project Structure

```
FlamingPalmKrakenV2/
├── index.ts                  # Bot entry point
├── deploy-commands.ts        # Registers slash commands with Discord API
├── prisma/
│   ├── schema.prisma         # MySQL schema
│   └── migrations/           # Prisma migration history
├── components/
│   ├── FpgClient.ts          # Extended Discord.js Client (core hub)
│   └── Assistant.ts          # OpenAI wrapper with tool-calling
├── events/                   # Discord.js event handlers
├── interactionHandlers/
│   ├── commands/             # Slash command handlers
│   ├── buttons/              # Button interaction handlers
│   ├── selects/              # Select menu handlers
│   └── contextmenus/         # Right-click context menu handlers
├── modules/
│   ├── RaidModule.ts         # Raid CRUD and attendance
│   ├── RaidScheduler.ts      # Scheduling lifecycle
│   ├── RaidEmbeds.ts         # Discord embed builders
│   ├── AchievementsModule.ts # Achievement tracking and profile images
│   ├── WebApi.ts             # Express server and OAuth
│   └── ApiFunctions/         # Route handlers by domain
├── utils/
│   └── logger.ts             # Colored logger with Bugsnag integration
└── assets/                   # Images and badge files
```

## Development

### Adding a Slash Command

1. Create `interactionHandlers/commands/my-command.ts`
2. Export a default object implementing `IHandler` with a `SlashCommandBuilder` in `data`
3. Run `npm run deploy` to register the command with Discord

### Adding a Button Handler

1. Create `interactionHandlers/buttons/my-button.ts`
2. Export a default object implementing `IHandler` where `name` matches the button's `customId`
3. No deploy step needed — matched at runtime by `customId`

### Database Changes

After editing `prisma/schema.prisma`, always run:

```bash
npx prisma migrate dev
npx prisma generate
```

### Logging

Use the custom logger everywhere — do not use `console.log`:

```typescript
import logger from './utils/logger';

logger.info('Something happened');
logger.error('Something failed', error);
```

## Deployment

The project deploys via **CapRover** using the `captain-definition` file. The Docker image uses `node:21-alpine`, installs Manrope fonts, compiles TypeScript, and exposes port 80 for the web API.

## CI/CD

- **CodeQL** security scanning runs automatically on push and pull requests to `master`
- Deployment is manual via CapRover git push
