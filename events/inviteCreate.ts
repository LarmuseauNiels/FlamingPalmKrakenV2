import { Guild, Invite } from "discord.js";
import { IEvent } from "../interfaces/IEvent";
import { createLogger } from "../utils/logger";

const log = createLogger("InviteCreate");

export default class inviteCreate implements IEvent {
  name = "inviteCreate";
  execute(invite: Invite) {
    (invite.guild as Guild)
      .invites.fetch()
      .then((invites) => {
        global.client.invites.set(invite.guild.id, invites);
      })
      .catch((error) => log.error("Failed to fetch guild invites:", error));
  }
}
