import {
  AutocompleteInteraction,
  BaseInteraction,
  SlashCommandBuilder,
} from "discord.js";

export interface IHandler {
  name: string;
  data: SlashCommandBuilder;
  execute(interaction: BaseInteraction): void;
  autocomplete?(interaction: AutocompleteInteraction): void;
}
