# Kraken - FlamingPalm Discord Bot

Discord bot for the FlamingPalm gaming community. Handles member management, achievements, raids, events, and a web API for the community website.

## Prerequisites

- Node.js 21+
- MySQL database
- Discord bot application (with token, client ID, OAuth secret)
- OpenAI API key (for AI assistant)
- Bugsnag API key (for error tracking)

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in the values
3. Install dependencies:
   ```bash
   npm install
   ```
4. Generate Prisma client:
   ```bash
   npx prisma generate
   ```
5. Push the database schema (first time only):
   ```bash
   npx prisma db push
   ```
6. Build and run:
   ```bash
   npm run build
   npm start
   ```

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Run the compiled bot |
| `npm run build` | Compile TypeScript to `./bin` |
| `npm run deploy` | Build and register slash commands with Discord |
| `npm test` | Run tests |

## Project Structure

```
├── index.ts                    # Entry point
├── components/
│   ├── FpgClient.ts            # Extended Discord.js Client
│   └── Assistant.ts            # OpenAI assistant integration
├── events/                     # Discord event handlers (IEvent)
├── interactionHandlers/
│   ├── commands/               # Slash commands (IHandler)
│   ├── buttons/                # Button interaction handlers
│   ├── selects/                # Select menu handlers
│   └── contextmenus/           # Context menu handlers
├── modules/
│   ├── AchievementsModule.ts   # XP, levels, badges
│   ├── RaidModule.ts           # Raid scheduling system
│   ├── WebApi.ts               # Express API server
│   ├── statistics.ts           # Cron-based tracking
│   ├── Logger.ts               # Structured logging
│   └── ApiFunctions/           # API endpoint handlers
├── islander/                   # Channel update utilities
├── interfaces/                 # IHandler, IEvent interfaces
├── config.ts                   # Centralized configuration
├── prisma/
│   └── schema.prisma           # Database schema
└── assets/                     # Badge images, backgrounds
```

## Key Features

- **Achievements & XP**: Members earn achievements and XP through activities. Levels are calculated as `floor(0.2 * sqrt(xp))`.
- **Raids**: Members create raids, sign up, and the bot schedules them via DM-based voting.
- **Points Store**: Members earn points and redeem them for rewards on the website.
- **Web API**: Express server with Discord OAuth, serving member data to flamingpalm.com.
- **AI Assistant**: OpenAI-powered bot that answers questions when mentioned.

## Deployment

The bot is deployed via CapRover using Docker (Node.js 21 Alpine). See `captain-definition` for the Docker configuration.
