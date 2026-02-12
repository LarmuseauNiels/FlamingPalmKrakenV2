# Kraken Bot - Development Guide

## Build & Run

```bash
npm run build          # Compile TypeScript → ./bin
npm start              # Run compiled bot
npm run deploy         # Build + register Discord slash commands
npm test               # Run tests
npx prisma generate    # Regenerate Prisma client after schema changes
```

## Architecture

### Handler Pattern
All event handlers and interaction handlers are loaded dynamically from their directories. Each file must have a **default export** of a class implementing the appropriate interface:

- **Events** (`events/*.ts`): Implement `IEvent` with `name`, `once?`, and `execute()`.
- **Commands/Buttons/Selects/ContextMenus** (`interactionHandlers/*/`): Implement `IHandler` with `name`, `data?`, `execute()`, and optional `autocomplete()`.

### Key Conventions
- **Global client**: `global.client` is the `FpgClient` instance, available everywhere. Declared in `index.ts`.
- **Database**: Use `global.client.prisma` for all database operations (Prisma ORM with MySQL).
- **Configuration**: Discord channel/role IDs are loaded from environment variables via `config.ts`. Never hardcode IDs.
- **Logging**: Use `Logger` from `modules/Logger.ts` instead of raw `console.log`.
- **Error handling**: Always use try/catch in command handlers. Use async/await instead of `.then()` chains.

### Module Patterns
- `AchievementsModule` and `WebApi` are instantiated on the client (`client.achievementsModule`, `client.webapi`).
- `RaidModule` is abstract with static methods.
- `statistics.ts` exports an async function that receives the client and sets up cron jobs.

### Button/Select Custom IDs
Button handlers use underscore-delimited custom IDs: `buttonName_param1_param2`. The handler is looked up by `customId.split("_")[0]`.
