import * as Canvas from "@napi-rs/canvas";
import type { CanvasRenderingContext2D } from "@napi-rs/canvas";

// ─── Types ───────────────────────────────────────────────────────────────────

type StatusType = "online" | "idle" | "dnd" | "offline" | "streaming";
type ProgressBarFillType = "COLOR" | "GRADIENT";
type BackgroundType = "COLOR" | "IMAGE";

export interface AchievementEntry {
  imagePath: string;
}

interface FontEntry {
  path: string;
  name?: string;
  face?: { name: string };
}

interface BuildOptions {
  fontX?: string;
  fontY?: string;
}

interface RankData {
  width: number;
  height: number;
  background: {
    type: "color" | "image";
    image: string | Buffer;
  };
  progressBar: {
    rounded: boolean;
    x: number;
    y: number;
    height: number;
    width: number;
    track: { color: string };
    bar: { type: "color" | "gradient"; color: string | string[] };
  };
  overlay: {
    display: boolean;
    level: number;
    color: string;
  };
  avatar: {
    source: string | Buffer | null;
    x: number;
    y: number;
    height: number;
    width: number;
  };
  status: {
    width: number | false;
    type: StatusType;
    color: string;
    circle: boolean;
  };
  rank: {
    display: boolean;
    data: number;
    textColor: string;
    color: string;
    displayText: string;
  };
  level: {
    display: boolean;
    data: number;
    textColor: string;
    color: string;
    displayText: string;
  };
  currentXP: { data: number; color: string };
  requiredXP: { data: number; color: string };
  discriminator: { discrim: string | number | null; color: string };
  username: { name: string | null; color: string };
  renderEmojis: boolean;
  minXP: { data: number; color: string };
  achievementToRender: AchievementEntry[];
  fontSize?: string;
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function abbrev(num: number | string): string {
  if (!num || isNaN(Number(num))) return "0";
  if (typeof num === "string") num = parseInt(num, 10);

  if (typeof Intl !== "undefined") {
    return new Intl.NumberFormat("en", { notation: "compact" }).format(num);
  }

  const decPlaces = Math.pow(10, 1);
  const suffixes = ["K", "M", "B", "T"];
  let result: number | string = num;

  for (let i = suffixes.length - 1; i >= 0; i--) {
    const size = Math.pow(10, (i + 1) * 3);
    if (size <= (result as number)) {
      result = Math.round(((result as number) * decPlaces) / size) / decPlaces;
      if (result === 1000 && i < suffixes.length - 1) {
        result = 1;
        i++;
      }
      result = `${result}${suffixes[i]}`;
      break;
    }
  }

  return `${result}`;
}

class Util {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static validateHex(hex: string): boolean {
    if (!hex || typeof hex !== "string") return false;
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
  }

  static discordTime(time: Date | number = new Date()): string {
    const date = time instanceof Date ? time : new Date();
    const hours = date.getHours() < 10 ? `0${date.getHours()}` : `${date.getHours()}`;
    const minutes = date.getMinutes() < 10 ? `0${date.getMinutes()}` : `${date.getMinutes()}`;
    return `Today at ${hours}:${minutes}`;
  }

  static formatTime(time: number): string {
    return time.toString();
  }

  static shorten(text: string, len: number): string {
    if (typeof text !== "string") return "";
    if (text.length <= len) return text;
    return text.substr(0, len).trim() + "...";
  }

  static toAbbrev(num: number | string): string {
    return abbrev(num);
  }

  static renderEmoji(ctx: CanvasRenderingContext2D, msg: string, x: number, y: number): void {
    ctx.fillText(msg, x, y);
  }

  static formatHex(hex: string, alt = "#000000"): string {
    if (!hex || typeof hex !== "string") return alt;
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6) return alt;
    return `#${hex}`;
  }

  static invertColor(hex: string): string {
    if (!hex || typeof hex !== "string") return "#FFFFFF";
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6) return "#FFFFFF";

    const r = (255 - parseInt(hex.slice(0, 2), 16)).toString(16);
    const g = (255 - parseInt(hex.slice(2, 4), 16)).toString(16);
    const b = (255 - parseInt(hex.slice(4, 6), 16)).toString(16);

    const pad = (txt: string, length = 2): string => {
      const arr = Array(length).join("0");
      return (arr + txt).slice(-length);
    };

    return `#${pad(r)}${pad(g)}${pad(b)}`;
  }

  static getAcronym(name: string): string {
    if (!name || typeof name !== "string") return "";
    return name
      .replace(/'s /g, " ")
      .replace(/\w+/g, (e) => e[0])
      .replace(/\s/g, "");
  }

  static getLines({
    text,
    ctx,
    maxWidth,
  }: {
    text: string;
    ctx: CanvasRenderingContext2D;
    maxWidth: number;
  }): string[] {
    if (!text) return [];
    if (!ctx) throw new Error("Canvas context was not provided!");
    if (!maxWidth) throw new Error("No max-width provided!");

    const lines: string[] = [];
    while (text.length) {
      let i: number;
      for (i = text.length; ctx.measureText(text.substr(0, i)).width > maxWidth; i -= 1);
      const result = text.substr(0, i);
      let j = 0;
      if (i !== text.length) {
        for (j = 0; result.indexOf(" ", j) !== -1; j = result.indexOf(" ", j) + 1);
      }
      lines.push(result.substr(0, j || result.length));
      text = text.substr(lines[lines.length - 1].length, text.length);
    }
    return lines;
  }
}

// ─── Rank ─────────────────────────────────────────────────────────────────────

export default class Rank {
  private data: RankData;

  constructor() {
    this.data = {
      width: 934,
      height: 282,
      background: {
        type: "color",
        image: "#23272A",
      },
      progressBar: {
        rounded: true,
        x: 275.5,
        y: 183.75,
        height: 37.5,
        width: 596.5,
        track: { color: "#484b4E" },
        bar: { type: "color", color: "#FFFFFF" },
      },
      overlay: {
        display: true,
        level: 0.5,
        color: "#333640",
      },
      avatar: {
        source: null,
        x: 70,
        y: 50,
        height: 180,
        width: 180,
      },
      status: {
        width: 5,
        type: "online",
        color: "#43B581",
        circle: false,
      },
      rank: {
        display: true,
        data: 1,
        textColor: "#FFFFFF",
        color: "#F3F3F3",
        displayText: "RANK",
      },
      level: {
        display: true,
        data: 1,
        textColor: "#FFFFFF",
        color: "#F3F3F3",
        displayText: "LEVEL",
      },
      currentXP: { data: 0, color: "#FFFFFF" },
      requiredXP: { data: 0, color: "#FFFFFF" },
      discriminator: { discrim: null, color: "rgba(255, 255, 255, 0.4)" },
      username: { name: null, color: "#FFFFFF" },
      renderEmojis: false,
      minXP: { data: 0, color: "#FFFFFF" },
      achievementToRender: [{ imagePath: "assets/achievement.png" }],
    };

    this.registerFonts();
  }

  registerFonts(fontArray: FontEntry[] = []): this {
    fontArray.forEach((font) => {
      Canvas.GlobalFonts.registerFromPath(font.path, font.name ?? font.face?.name);
    });
    return this;
  }

  setRenderEmojis(apply = false): this {
    this.data.renderEmojis = !!apply;
    return this;
  }

  setFontSize(size: string): this {
    this.data.fontSize = size;
    return this;
  }

  setUsername(name: string, color = "#FFFFFF"): this {
    if (typeof name !== "string")
      throw new Error(`Expected username to be a string, received ${typeof name}!`);
    this.data.username.name = name;
    this.data.username.color = typeof color === "string" ? color : "#FFFFFF";
    return this;
  }

  setAchievements(achievements: AchievementEntry[] = []): this {
    this.data.achievementToRender = achievements;
    return this;
  }

  setDiscriminator(discriminator: string | number, color = "rgba(255, 255, 255, 0.4)"): this {
    this.data.discriminator.discrim =
      !isNaN(Number(discriminator)) && `${discriminator}`.length === 4
        ? discriminator
        : null;
    this.data.discriminator.color = typeof color === "string" ? color : "rgba(255, 255, 255, 0.4)";
    return this;
  }

  setProgressBar(color: string | string[], fillType: ProgressBarFillType = "COLOR", rounded = true): this {
    switch (fillType) {
      case "COLOR":
        if (typeof color !== "string")
          throw new Error(`Color type must be a string, received ${typeof color}!`);
        this.data.progressBar.bar.color = color;
        this.data.progressBar.bar.type = "color";
        this.data.progressBar.rounded = !!rounded;
        break;
      case "GRADIENT":
        if (!Array.isArray(color))
          throw new Error(`Color type must be Array, received ${typeof color}!`);
        this.data.progressBar.bar.color = color.slice(0, 2);
        this.data.progressBar.bar.type = "gradient";
        this.data.progressBar.rounded = !!rounded;
        break;
      default:
        throw new Error(`Unsupported progressbar type "${fillType}"!`);
    }
    return this;
  }

  setProgressBarTrack(color: string): this {
    if (typeof color !== "string")
      throw new Error(`Color type must be a string, received "${typeof color}"!`);
    this.data.progressBar.track.color = color;
    return this;
  }

  setOverlay(color: string, level = 0.5, display = true): this {
    if (typeof color !== "string")
      throw new Error(`Color type must be a string, received "${typeof color}"!`);
    this.data.overlay.color = color;
    this.data.overlay.display = !!display;
    this.data.overlay.level = typeof level === "number" ? level : 0.5;
    return this;
  }

  setRequiredXP(data: number, color = "#FFFFFF"): this {
    if (typeof data !== "number")
      throw new Error(`Required xp data type must be a number, received ${typeof data}!`);
    this.data.requiredXP.data = data;
    this.data.requiredXP.color = typeof color === "string" ? color : "#FFFFFF";
    return this;
  }

  setMinXP(data: number, color = "#FFFFFF"): this {
    if (typeof data !== "number")
      throw new Error(`Min xp data type must be a number, received ${typeof data}!`);
    this.data.minXP.data = data;
    this.data.minXP.color = typeof color === "string" ? color : "#FFFFFF";
    return this;
  }

  setCurrentXP(data: number, color = "#FFFFFF"): this {
    if (typeof data !== "number")
      throw new Error(`Current xp data type must be a number, received ${typeof data}!`);
    this.data.currentXP.data = data;
    this.data.currentXP.color = typeof color === "string" ? color : "#FFFFFF";
    return this;
  }

  setRank(data: number, text = "RANK", display = true): this {
    if (typeof data !== "number")
      throw new Error(`Level data must be a number, received ${typeof data}!`);
    this.data.rank.data = data;
    this.data.rank.display = !!display;
    this.data.rank.displayText = typeof text === "string" && text ? text : "RANK";
    return this;
  }

  setRankColor(text = "#FFFFFF", number = "#FFFFFF"): this {
    this.data.rank.textColor = typeof text === "string" && text ? text : "#FFFFFF";
    this.data.rank.color = typeof number === "string" && number ? number : "#FFFFFF";
    return this;
  }

  setLevelColor(text = "#FFFFFF", number = "#FFFFFF"): this {
    this.data.level.textColor = typeof text === "string" && text ? text : "#FFFFFF";
    this.data.level.color = typeof number === "string" && number ? number : "#FFFFFF";
    return this;
  }

  setLevel(data: number, text = "LEVEL", display = true): this {
    if (typeof data !== "number")
      throw new Error(`Level data must be a number, received ${typeof data}!`);
    this.data.level.data = data;
    this.data.level.display = !!display;
    this.data.level.displayText = typeof text === "string" && text ? text : "LEVEL";
    return this;
  }

  setCustomStatusColor(color: string): this {
    if (!color || typeof color !== "string") throw new Error("Invalid color!");
    this.data.status.color = color;
    return this;
  }

  setStatus(status: StatusType, circle = false, width: number | false = 5): this {
    const statusColors: Record<StatusType, string> = {
      online: "#43B581",
      idle: "#FAA61A",
      dnd: "#F04747",
      offline: "#747F8E",
      streaming: "#593595",
    };

    if (!(status in statusColors)) throw new Error(`Invalid status "${status}"`);

    this.data.status.type = status;
    this.data.status.color = statusColors[status];
    this.data.status.width = width !== false ? (typeof width === "number" ? width : 5) : false;
    this.data.status.circle = circle;

    return this;
  }

  setBackground(type: BackgroundType, data: string | Buffer): this {
    if (!data) throw new Error("Missing field : data");
    switch (type) {
      case "COLOR":
        this.data.background.type = "color";
        this.data.background.image = typeof data === "string" ? data : "#23272A";
        break;
      case "IMAGE":
        this.data.background.type = "image";
        this.data.background.image = data;
        break;
      default:
        throw new Error(`Unsupported background type "${type}"`);
    }
    return this;
  }

  setAvatar(data: string | Buffer): this {
    if (!data) throw new Error(`Invalid avatar type "${typeof data}"!`);
    this.data.avatar.source = data;
    return this;
  }

  async build(
    ops: BuildOptions = {
      fontX: "MANROPE_BOLD,NOTO_COLOR_EMOJI",
      fontY: "MANROPE_BOLD,NOTO_COLOR_EMOJI",
    }
  ): Promise<Buffer> {
    if (typeof this.data.currentXP.data !== "number")
      throw new Error(`Expected currentXP to be a number, received ${typeof this.data.currentXP.data}!`);
    if (typeof this.data.requiredXP.data !== "number")
      throw new Error(`Expected requiredXP to be a number, received ${typeof this.data.requiredXP.data}!`);
    if (!this.data.avatar.source) throw new Error("Avatar source not found!");
    if (!this.data.username.name) throw new Error("Missing username");

    const fontX = ops.fontX ?? "MANROPE_BOLD,NOTO_COLOR_EMOJI";

    let bg: Canvas.Image | null = null;
    if (this.data.background.type === "image") {
      bg = await Canvas.loadImage(this.data.background.image as string | Buffer);
    }
    const avatar = await Canvas.loadImage(this.data.avatar.source as string | Buffer);

    const canvas = Canvas.createCanvas(this.data.width, this.data.height);
    const ctx = canvas.getContext("2d");

    // Background
    if (bg) {
      ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = this.data.background.image as string;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Overlay
    if (this.data.overlay.display) {
      ctx.globalAlpha = this.data.overlay.level || 1;
      ctx.fillStyle = this.data.overlay.color;
      ctx.fillRect(10, 10, canvas.width - 20, canvas.height - 20);
    }
    ctx.globalAlpha = 1;

    // Username
    ctx.font = `bold 32px ${fontX}`;
    ctx.fillStyle = this.data.username.color;
    ctx.textAlign = "start";
    const name = Util.shorten(this.data.username.name, 20);

    if (!this.data.renderEmojis) {
      ctx.fillText(`${name}`, 257 + 18.5, 50);
    } else {
      Util.renderEmoji(ctx, name, 257 + 18.5, 50);
    }

    // Achievements
    let achievementXlocation = 224;
    for (const achievement of this.data.achievementToRender) {
      const badge = await Canvas.loadImage(achievement.imagePath);
      ctx.drawImage(badge, achievementXlocation, 70, 150, 150);
      achievementXlocation += 150;
    }

    // Level
    if (this.data.level.display && !isNaN(this.data.level.data)) {
      ctx.font = `bold 32px ${fontX}`;
      ctx.fillStyle = this.data.level.textColor;
      ctx.fillText(
        this.data.level.displayText,
        740 - ctx.measureText(Util.toAbbrev(this.data.level.data)).width,
        50
      );

      ctx.font = `bold 32px ${fontX}`;
      ctx.fillStyle = this.data.level.color;
      ctx.textAlign = "end";
      ctx.fillText(Util.toAbbrev(this.data.level.data), 860, 50);
    }

    // Rank
    if (this.data.rank.display && !isNaN(this.data.rank.data)) {
      ctx.font = `bold 36px ${fontX}`;
      ctx.fillStyle = this.data.rank.textColor;
      ctx.fillText(
        this.data.rank.displayText,
        800 -
          ctx.measureText(Util.toAbbrev(this.data.level.data) || "-").width -
          7 -
          ctx.measureText(this.data.level.displayText).width -
          7 -
          ctx.measureText(Util.toAbbrev(this.data.rank.data) || "-").width,
        82
      );

      ctx.font = `bold 32px ${fontX}`;
      ctx.fillStyle = this.data.rank.color;
      ctx.textAlign = "end";
      ctx.fillText(
        Util.toAbbrev(this.data.rank.data),
        790 -
          ctx.measureText(Util.toAbbrev(this.data.level.data) || "-").width -
          7 -
          ctx.measureText(this.data.level.displayText).width,
        82
      );
    }

    // XP text
    ctx.font = `bold 30px ${fontX}`;
    ctx.fillStyle = this.data.requiredXP.color;
    ctx.textAlign = "start";
    ctx.fillText(
      "/ " + Util.toAbbrev(this.data.requiredXP.data),
      720 + ctx.measureText(Util.toAbbrev(this.data.currentXP.data)).width + 15,
      228
    );
    ctx.fillStyle = this.data.currentXP.color;
    ctx.fillText(Util.toAbbrev(this.data.currentXP.data), 720, 228);

    // Progress bar
    ctx.beginPath();
    if (this.data.progressBar.rounded) {
      const xCoordinate = 257;
      const yCoordinate = 222;
      const radius = 9;
      const barWidth = 615;
      const height = 19;
      const progress = this._calculateProgress;

      // Track (background)
      ctx.fillStyle = this.data.progressBar.track.color;
      ctx.arc(xCoordinate + radius, yCoordinate + radius + radius * 2, radius, 1.5 * Math.PI, 0.5 * Math.PI, true);
      ctx.fill();
      ctx.fillRect(xCoordinate + radius, yCoordinate + radius * 2, barWidth - radius, height);
      ctx.arc(xCoordinate + barWidth, yCoordinate + radius + radius * 2, radius, 1.5 * Math.PI, 0.5 * Math.PI, false);
      ctx.fill();

      ctx.beginPath();

      // Bar fill
      if (this.data.progressBar.bar.type === "gradient") {
        const gradientContext = ctx.createRadialGradient(progress, 0, 500, 0, 0, 0);
        (this.data.progressBar.bar.color as string[]).forEach((color, index) => {
          gradientContext.addColorStop(index, color);
        });
        ctx.fillStyle = gradientContext;
      } else {
        ctx.fillStyle = this.data.progressBar.bar.color as string;
      }

      ctx.arc(xCoordinate + radius, yCoordinate + radius + radius * 2, radius, 1.5 * Math.PI, 0.5 * Math.PI, true);
      ctx.fill();
      ctx.fillRect(xCoordinate + radius, yCoordinate + radius * 2, progress, height);
      ctx.arc(xCoordinate + radius + progress, yCoordinate + radius + radius * 2, radius, 1.5 * Math.PI, 0.5 * Math.PI, false);
      ctx.fill();
    } else {
      ctx.fillStyle = this.data.progressBar.bar.color as string;
      ctx.fillRect(
        this.data.progressBar.x,
        this.data.progressBar.y,
        this._calculateProgress,
        this.data.progressBar.height
      );

      ctx.beginPath();
      ctx.strokeStyle = this.data.progressBar.track.color;
      ctx.lineWidth = 7;
      ctx.strokeRect(
        this.data.progressBar.x,
        this.data.progressBar.y,
        this.data.progressBar.width,
        this.data.progressBar.height
      );
    }

    // Avatar (clipped circle)
    ctx.save();
    ctx.beginPath();
    ctx.arc(115 + 10, 125 + 20, 100, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 25, 45, this.data.avatar.width + 20, this.data.avatar.height + 20);
    ctx.restore();

    // Status indicator
    if (this.data.status.circle) {
      ctx.beginPath();
      ctx.fillStyle = this.data.status.color;
      ctx.arc(205, 205, 20, 0, 2 * Math.PI);
      ctx.fill();
      ctx.closePath();
    } else if (this.data.status.width !== false) {
      ctx.beginPath();
      ctx.arc(125, 145, 100, 0, Math.PI * 2, true);
      ctx.strokeStyle = this.data.status.color;
      ctx.lineWidth = this.data.status.width as number;
      ctx.stroke();
    }

    return await canvas.encode("png");
  }

  private get _calculateProgress(): number {
    const cx = this.data.currentXP.data;
    const rx = this.data.requiredXP.data;

    if (rx <= 0) return 1;
    if (cx > rx) return parseInt(String(this.data.progressBar.width)) || 0;

    if (this.data.minXP.data > 0) {
      const mx = this.data.minXP.data;
      if (cx < mx) return 0;
      return parseInt(String(((cx - mx) * 615) / (rx - mx))) || 0;
    }

    const width = (cx * 615) / rx;
    if (width > this.data.progressBar.width) return this.data.progressBar.width;
    return parseInt(String(width)) || 0;
  }
}
