// Startup migration runner. Applies pending Prisma migrations before the bot
// boots (invoked by `npm start`).
//
// Why this exists: the `discordstats` database predates Prisma's migration
// history — it was introspected, so there is no `_prisma_migrations` table and
// the legacy `Timezone` column already exists. A plain `prisma migrate deploy`
// would try to replay the legacy migration first and fail with "duplicate
// column", never reaching later migrations. So we first BASELINE the legacy
// migration as already-applied, then deploy. Both steps are idempotent and safe
// to run on every boot.
//
// Plain JS on purpose: it runs via `node` directly (not compiled by tsc) and
// only shells out to the Prisma CLI, which is present in node_modules.

const { execSync } = require("child_process");

// Migrations that existed before Prisma migrate was adopted, in order. Their
// effects are already present in the live schema, so they must be recorded as
// applied rather than re-run.
const LEGACY_MIGRATIONS = ["20260311000000_add_timezone_to_members"];

function run(cmd) {
  console.log(`[migrate] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

try {
  for (const name of LEGACY_MIGRATIONS) {
    // First boot on an introspected DB: creates _prisma_migrations and records
    // this migration as applied. Later boots: errors "already recorded", which
    // we deliberately ignore. A real connection error here will resurface from
    // `migrate deploy` below and abort startup.
    try {
      run(`npx prisma migrate resolve --applied ${name}`);
    } catch (e) {
      console.log(`[migrate] baseline of ${name} skipped (already applied)`);
    }
  }

  run("npx prisma migrate deploy");
  console.log("[migrate] migrations up to date");
} catch (e) {
  console.error("[migrate] migrate deploy failed — aborting startup:", e.message);
  process.exit(1);
}
