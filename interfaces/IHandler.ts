import {
  AutocompleteInteraction,
  BaseInteraction,
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
} from "discord.js";

export interface IHandler {
  name: string;
  data?: SlashCommandBuilder | ContextMenuCommandBuilder;
  execute(interaction: BaseInteraction): void;
  autocomplete?(interaction: AutocompleteInteraction): void;
  isGuild?: boolean;
}
