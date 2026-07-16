import axios from "axios";
import { createLogger } from "../utils/logger";

const log = createLogger("SteamModule");

const STORE_SEARCH_URL = "https://store.steampowered.com/api/storesearch/";
const APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails";

interface SteamSearchHit {
  id: number;
  name: string;
  price?: { currency?: string; initial?: number; final?: number };
}

/**
 * Looks up a game on the Steam storefront by name and returns a concise,
 * plain-text summary suitable for the AI assistant to relay. Never throws —
 * returns a graceful fallback string on any failure.
 */
export async function getSteamGameInfo(query: string): Promise<string> {
  if (!query || typeof query !== "string" || !query.trim()) {
    return "Please provide the name of a game to look up on Steam.";
  }
  const term = query.trim();

  try {
    // 1) Search the storefront for the game by name.
    const searchRes = await axios.get(STORE_SEARCH_URL, {
      params: { term, cc: "us", l: "en" },
      headers: { Accept: "application/json" },
      timeout: 10000,
      validateStatus: () => true,
    });

    if (searchRes.status < 200 || searchRes.status >= 300) {
      log.warn(`Steam storesearch returned ${searchRes.status} for "${term}"`);
      return `Sorry, I couldn't reach the Steam store to look up "${term}" right now.`;
    }

    const hits: SteamSearchHit[] = searchRes.data?.items || [];
    if (!hits.length) {
      return `No Steam game found matching "${term}".`;
    }

    const top = hits[0];
    const appId = top.id;
    const storeUrl = `https://store.steampowered.com/app/${appId}`;

    // 2) Fetch full details for the top result.
    const detailsRes = await axios.get(APP_DETAILS_URL, {
      params: { appids: appId, cc: "us", l: "en" },
      headers: { Accept: "application/json" },
      timeout: 10000,
      validateStatus: () => true,
    });

    const entry = detailsRes.data?.[appId];
    if (
      detailsRes.status < 200 ||
      detailsRes.status >= 300 ||
      !entry ||
      entry.success !== true ||
      !entry.data
    ) {
      // Fall back to the search hit's basic info.
      const price = formatSearchPrice(top);
      return [
        `**${top.name}** (Steam)`,
        price ? `Price: ${price}` : null,
        `Store page: ${storeUrl}`,
      ]
        .filter(Boolean)
        .join("\n");
    }

    const d = entry.data;
    const lines: string[] = [];
    lines.push(`**${d.name}** (Steam)`);

    if (d.short_description) {
      lines.push(stripTags(d.short_description));
    }

    if (Array.isArray(d.genres) && d.genres.length) {
      lines.push(`Genres: ${d.genres.map((g: any) => g.description).join(", ")}`);
    }

    lines.push(`Price: ${formatDetailsPrice(d)}`);

    if (d.release_date?.date) {
      const prefix = d.release_date.coming_soon ? "Releases" : "Released";
      lines.push(`${prefix}: ${d.release_date.date}`);
    }

    if (Array.isArray(d.developers) && d.developers.length) {
      lines.push(`Developer: ${d.developers.join(", ")}`);
    }
    if (Array.isArray(d.publishers) && d.publishers.length) {
      lines.push(`Publisher: ${d.publishers.join(", ")}`);
    }

    if (d.metacritic?.score) {
      lines.push(`Metacritic: ${d.metacritic.score}`);
    }

    if (d.platforms) {
      const platforms = ["windows", "mac", "linux"]
        .filter((p) => d.platforms[p])
        .map((p) => (p === "mac" ? "macOS" : p.charAt(0).toUpperCase() + p.slice(1)));
      if (platforms.length) lines.push(`Platforms: ${platforms.join(", ")}`);
    }

    lines.push(`Store page: ${storeUrl}`);

    return lines.join("\n");
  } catch (error) {
    log.error(`Failed to look up Steam game "${term}"`, error);
    return `Sorry, I couldn't look up "${term}" on Steam right now.`;
  }
}

function formatDetailsPrice(d: any): string {
  if (d.is_free) return "Free to Play";
  const p = d.price_overview;
  if (!p) return "Not available";
  // final_formatted already includes the currency symbol.
  if (p.final_formatted) {
    if (p.discount_percent) {
      return `${p.final_formatted} (-${p.discount_percent}%)`;
    }
    return p.final_formatted;
  }
  return "Not available";
}

function formatSearchPrice(hit: SteamSearchHit): string | null {
  const p = hit.price;
  if (!p) return "Free to Play";
  if (typeof p.final === "number") {
    // Steam returns prices in cents.
    return `$${(p.final / 100).toFixed(2)}`;
  }
  return null;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
