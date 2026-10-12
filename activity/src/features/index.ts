import type { Feature } from "../shell";
import { raids } from "./raids";
import { store } from "./store";

/**
 * The tab bar, in order. The first openable feature is shown on launch.
 *
 * To add a feature: create `features/<name>.ts` exporting a `Feature`, then
 * list it here. Entries with `comingSoon` render as disabled tabs — drop the
 * flag and give them a real `mount` once they're built.
 */
export const features: Feature[] = [
  raids,
  store,
  { id: "servers", label: "Servers", icon: "🖥️", comingSoon: true, mount() {} },
];
