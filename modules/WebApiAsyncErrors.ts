import type express from "express";

/**
 * Express 4 ignores the promise an async route handler returns, so a thrown
 * error never reached the error handlers: the request hung until the client
 * gave up and Bugsnag never heard of it. Wrapping every route handler to pass
 * rejections to next(err) covers all routes at once. (Express 5 does this
 * itself; drop this when upgrading.)
 */
export function forwardAsyncErrors(target: express.Express): void {
  for (const method of ["get", "post", "put", "patch", "delete"] as const) {
    const register = target[method].bind(target) as (...args: unknown[]) => unknown;
    (target as any)[method] = (...args: unknown[]) => {
      // app.get("setting") with one argument reads a setting; leave it alone.
      if (args.length < 2) return register(...args);
      const [path, ...handlers] = args;
      return register(path, ...handlers.map(forwardRejections));
    };
  }
}

function forwardRejections(handler: unknown): unknown {
  // Error middleware (4 params) and non-functions (arrays, routers) pass through.
  if (typeof handler !== "function" || handler.length === 4) return handler;
  return function (req: express.Request, res: express.Response, next: express.NextFunction) {
    try {
      const result = handler(req, res, next);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        (result as Promise<unknown>).catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
}
