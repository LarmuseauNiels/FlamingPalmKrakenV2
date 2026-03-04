import { Channel } from "discord.js";
import { IEvent } from "../interfaces/IEvent";

export default class ChannelCreateEvent implements IEvent {
  name = "channelCreate";
  execute(channel: Channel) {}
}
