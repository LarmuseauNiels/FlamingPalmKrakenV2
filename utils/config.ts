/**
 * Startup configuration checks. Bad configuration should stop the bot at boot
 * with a clear message, not surface hours later as a NaN date or an undefined
 * JWT secret in the middle of a request.
 */

/** Variables the bot cannot run without. Optional ones are read where used. */
const REQUIRED_ENV = ["TOKEN", "CLIENT_ID", "GUILD_ID", "DATABASE_URL", "JWT_SECRET"] as const;

/** Throws when a required variable is missing or blank, naming all of them at once. */
export function assertRequiredEnv(): void {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

/**
 * An integer environment variable within [min, max], or `fallback` when unset.
 * A value that is set but invalid throws at module load, so a typo like
 * RAID_EXPIRY_DAYS=21d fails the deploy instead of breaking every query.
 */
export function envInt(name: string, fallback: number, min: number, max: number): number {
  if (!(Number.isInteger(fallback) && min <= fallback && fallback <= max)) {
    throw new Error(`envInt(${name}): fallback ${fallback} is outside [${min}, ${max}]`);
  }
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`${name} must be an integer, got "${raw}"`);
  }
  const value = Number(raw);
  if (value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}, got ${value}`);
  }
  return value;
}
