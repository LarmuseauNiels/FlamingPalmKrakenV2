import { Guild, Invite } from "discord.js";
import { IEvent } from "../interfaces/IEvent";

export default class inviteCreate implements IEvent {
  name = "inviteCreate";
  execute(invite: Invite) {
    (invite.guild as Guild).invites.fetch().then((invites) => {
      global.client.invites.set(invite.guild.id, invites);
    });
  }
}
