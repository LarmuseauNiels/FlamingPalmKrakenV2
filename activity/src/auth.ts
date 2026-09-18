import { DiscordSDK } from "@discord/embedded-app-sdk";
import { getJson, postJson } from "./http";

export interface Session {
  sdk: DiscordSDK;
  /** Our own JWT — accepted by every existing /members/* endpoint. */
  token: string;
  userId: string;
  username: string;
}

interface ActivityConfig {
  clientId: string;
}

interface TokenResponse {
  access_token: string;
  token: string;
}

/**
 * Full Activity handshake:
 *
 *   1. pull the client id from our API (so it isn't baked into the bundle)
 *   2. hand-shake with the Discord client
 *   3. authorize → OAuth code (only `identify`; guild membership is verified
 *      server-side against the bot's guild cache)
 *   4. trade the code with our API for a Discord access token + our JWT
 *   5. authenticate the SDK so privileged SDK commands become available
 */
export async function connect(): Promise<Session> {
  const { clientId } = await getJson<ActivityConfig>("/api/activity/config");

  const sdk = new DiscordSDK(clientId);
  await sdk.ready();

  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: ["identify"],
  });

  const { access_token, token } = await postJson<TokenResponse>(
    "/api/activity/token",
    { code }
  );

  const auth = await sdk.commands.authenticate({ access_token });
  if (!auth) {
    throw new Error("Discord rejected the authentication");
  }

  // global_name (the modern display name) isn't guaranteed to be in the SDK's
  // user type across versions, so read it defensively.
  const displayName =
    (auth.user as { global_name?: string | null }).global_name ?? auth.user.username;

  return { sdk, token, userId: auth.user.id, username: displayName };
}
