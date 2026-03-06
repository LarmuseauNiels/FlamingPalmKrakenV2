enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LEVEL_NAMES: Record<number, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

const COLORS: Record<number, string> = {
  [LogLevel.DEBUG]: "\x1b[36m", // cyan
  [LogLevel.INFO]: "\x1b[32m",  // green
  [LogLevel.WARN]: "\x1b[33m",  // yellow
  [LogLevel.ERROR]: "\x1b[31m", // red
};

const RESET = "\x1b[0m";

function getConfiguredLevel(): LogLevel {
  switch (process.env.LOG_LEVEL?.toUpperCase()) {
    case "DEBUG": return LogLevel.DEBUG;
    case "WARN":  return LogLevel.WARN;
    case "ERROR": return LogLevel.ERROR;
    default:      return LogLevel.INFO;
  }
}

function formatMessage(level: LogLevel, context: string, args: any[]): string {
  const timestamp = new Date().toISOString();
  const color = COLORS[level];
  const label = LEVEL_NAMES[level].padEnd(5);
  const ctx = context ? ` [${context}]` : "";
  const body = args
    .map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === "object" ? JSON.stringify(a) : String(a)))
    .join(" ");
  return `${color}[${timestamp}] [${label}]${ctx} ${body}${RESET}`;
}

class Logger {
  constructor(private readonly context: string = "") {}

  private shouldLog(level: LogLevel): boolean {
    return level >= getConfiguredLevel();
  }

  debug(...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(formatMessage(LogLevel.DEBUG, this.context, args));
    }
  }

  info(...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(formatMessage(LogLevel.INFO, this.context, args));
    }
  }

  warn(...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(formatMessage(LogLevel.WARN, this.context, args));
    }
  }

  error(...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(formatMessage(LogLevel.ERROR, this.context, args));
    }
    // Automatically report Error instances to Bugsnag so every log.error() call
    // with an Error object is tracked in production, regardless of whether the
    // call site explicitly calls global.bugsnag.notify().
    const bugsnag = (global as any).bugsnag;
    if (bugsnag) {
      for (const arg of args) {
        if (arg instanceof Error) {
          bugsnag.notify(arg);
          break;
        }
      }
    }
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}
