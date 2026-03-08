import jwt from "jsonwebtoken";
import { createLogger } from "../../utils/logger";

const log = createLogger("Helpers");

export function jsonify(obj) {
  return JSON.stringify(obj, (key, value) =>
    typeof value === "bigint" ? Number(value) : value
  );
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET as string, (err: any, user: any) => {
    if (err) {
      log.warn("JWT verification error:", err);
      return res.sendStatus(403);
    }

    req.user = user;

    next();
  });
}

const adminIdList = (process.env.ADMIN_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);

export function authenticateAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    if (!adminIdList.includes(req.user.id)) {
      log.warn("Non-admin user attempted admin access:", req.user.id);
      return res.sendStatus(403);
    }
    next();
  });
}
