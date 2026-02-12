import jwt from "jsonwebtoken";
import { config } from "../../config";

export function jsonify(obj: any): string {
  return JSON.stringify(obj, (_key: string, value: any) =>
    typeof value === "bigint" ? Number(value) : value
  );
}

export function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, config.jwtSecret, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}
