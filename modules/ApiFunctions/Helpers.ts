import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { createLogger } from "../../utils/logger";
import { requiredEnv } from "../../utils/config";

/** What the website and Activity JWTs carry (see /login and /api/activity/token). */
export interface AuthUser {
  id: string;
  username: string;
  avatar?: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // Passport types req.user as Express.User; ours is the JWT payload.
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User extends AuthUser {}
  }
}

/**
 * The signed-in member on a route behind authenticateToken. Throwing (→ 500)
 * if it's missing turns a route registered without the middleware into a loud
 * bug instead of a quiet "undefined" user id in a query.
 */
export function authUser(req: Request): AuthUser {
  const user = req.user;
  if (!user?.id) throw new Error(`No authenticated user on ${req.method} ${req.path}: route is missing authenticateToken`);
  return user;
}

const log = createLogger("Helpers");

/**
 * Longest a token is accepted, counted from when it was issued (`iat`), on top
 * of any `exp` it carries. Website tokens used to be signed without an expiry;
 * this bounds those too, so no login stays valid forever.
 */
export const JWT_MAX_AGE = "30d";

/** The Prisma error code (e.g. "P2025" record not found) of a caught error, if any. */
export function prismaErrorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

export function jsonify(obj: unknown) {
  return JSON.stringify(obj, (_key, value) =>
    typeof value === "bigint" ? Number(value) : value
  );
}

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, requiredEnv("JWT_SECRET"), { maxAge: JWT_MAX_AGE }, (err, user) => {
    if (err) {
      // 401, not 403: the caller isn't authenticated. Clients log out and sign
      // in again on 401; 403 is kept for "signed in, but not allowed".
      log.debug("JWT rejected:", err.message);
      return res.sendStatus(401);
    }

    req.user = user as AuthUser;

    next();
  });
}

export function getAdminIds(): string[] {
  return (process.env.ADMIN_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);
}

export function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  authenticateToken(req, res, () => {
    const user = authUser(req);
    if (!getAdminIds().includes(user.id)) {
      log.warn("Non-admin user attempted admin access:", user.id);
      return res.sendStatus(403);
    }
    next();
  });
}
