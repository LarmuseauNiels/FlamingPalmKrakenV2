import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

import { forwardAsyncErrors } from "../modules/WebApiAsyncErrors";

test("a rejected async route handler becomes a 500 instead of hanging", async () => {
  const app = express();
  forwardAsyncErrors(app);
  app.get("/boom", async () => {
    throw new Error("boom");
  });
  app.get("/ok", (_req, res) => {
    res.send("ok");
  });
  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).send("handled");
  });
  assert.equal(app.get("env"), "development", "app.get(setting) still reads settings");

  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const boom = await fetch(`http://127.0.0.1:${port}/boom`, { signal: AbortSignal.timeout(2000) });
    assert.equal(boom.status, 500);
    assert.equal(await boom.text(), "handled");
    const ok = await fetch(`http://127.0.0.1:${port}/ok`);
    assert.equal(await ok.text(), "ok");
  } finally {
    server.close();
  }
});
