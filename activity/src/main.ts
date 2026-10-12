import "./style.css";
import { connect } from "./auth";
import { features } from "./features";
import { renderShell } from "./shell";
import { describe, renderError, renderStatus } from "./ui";

async function boot(): Promise<void> {
  try {
    renderStatus("Connecting to Discord…");
    const session = await connect();
    renderShell(session, features);
  } catch (err) {
    console.error("Activity failed to start", err);
    renderError(describe(err));
  }
}

boot();
