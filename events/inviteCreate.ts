import { Guild, Invite } from "discord.js";
import { IEvent } from "../interfaces/IEvent";
import { createLogger } from "../utils/logger";

const log = createLogger("InviteCreate");

export default class inviteCreate implements IEvent {
  name = "inviteCreate";
  execute(invite: Invite) {
    // Group-DM invites have no guild, so there's nothing to track.
    const guild = invite.guild as Guild | null;
    if (!guild) return;
    guild.invites
      .fetch()
      .then((invites) => {
        global.client.invites.set(guild.id, invites);
      })
      .catch((error) => log.error("Failed to fetch guild invites:", error));
  }
}
