import jwt from "jsonwebtoken";
import { createLogger } from "../../utils/logger";

const log = createLogger("Helpers");

/**
 * Longest a token is accepted, counted from when it was issued (`iat`), on top
 * of any `exp` it carries. Website tokens used to be signed without an expiry;
 * this bounds those too, so no login stays valid forever.
 */
export const JWT_MAX_AGE = "30d";

export function jsonify(obj) {
  return JSON.stringify(obj, (key, value) =>
    typeof value === "bigint" ? Number(value) : value
  );
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET as string, { maxAge: JWT_MAX_AGE }, (err: any, user: any) => {
    if (err) {
      // 401, not 403: the caller isn't authenticated. Clients log out and sign
      // in again on 401; 403 is kept for "signed in, but not allowed".
      log.debug("JWT rejected:", err.message);
      return res.sendStatus(401);
    }

    req.user = user;

    next();
  });
}

export function getAdminIds(): string[] {
  return (process.env.ADMIN_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);
}

export function authenticateAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    if (!getAdminIds().includes(req.user.id)) {
      log.warn("Non-admin user attempted admin access:", req.user.id);
      return res.sendStatus(403);
    }
    next();
  });
}
