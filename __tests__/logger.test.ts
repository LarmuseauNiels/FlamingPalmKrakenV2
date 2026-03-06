import { createLogger } from "../utils/logger";

describe("createLogger", () => {
  it("returns a logger instance with debug/info/warn/error methods", () => {
    const log = createLogger("Test");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });
});

describe("Logger output", () => {
  let consoleSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.LOG_LEVEL;
  });

  it("logs info messages to console.log by default", () => {
    const log = createLogger("Test");
    log.info("hello world");
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0][0]).toContain("hello world");
    expect(consoleSpy.mock.calls[0][0]).toContain("INFO");
  });

  it("includes context in the log output", () => {
    const log = createLogger("MyContext");
    log.info("msg");
    expect(consoleSpy.mock.calls[0][0]).toContain("[MyContext]");
  });

  it("does not include empty context brackets when context is empty", () => {
    const log = createLogger("");
    log.info("msg");
    // The output contains "[" for timestamp/level formatting, but should not
    // contain "[]" which would indicate an empty context tag was added.
    expect(consoleSpy.mock.calls[0][0]).not.toContain("[]");
  });

  it("logs warn messages to console.warn", () => {
    const log = createLogger("Test");
    log.warn("something");
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0][0]).toContain("WARN");
  });

  it("logs error messages to console.error", () => {
    const log = createLogger("Test");
    log.error("boom");
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0][0]).toContain("ERROR");
  });

  it("suppresses debug messages when LOG_LEVEL is INFO (default)", () => {
    delete process.env.LOG_LEVEL;
    const log = createLogger("Test");
    log.debug("hidden");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("shows debug messages when LOG_LEVEL=DEBUG", () => {
    process.env.LOG_LEVEL = "DEBUG";
    const log = createLogger("Test");
    log.debug("visible");
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0][0]).toContain("DEBUG");
  });

  it("suppresses info messages when LOG_LEVEL=WARN", () => {
    process.env.LOG_LEVEL = "WARN";
    const log = createLogger("Test");
    log.info("hidden");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("suppresses warn messages when LOG_LEVEL=ERROR", () => {
    process.env.LOG_LEVEL = "ERROR";
    const log = createLogger("Test");
    log.warn("hidden");
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("formats Error instances using stack trace", () => {
    const log = createLogger("Test");
    const err = new Error("test error");
    log.info(err);
    expect(consoleSpy.mock.calls[0][0]).toContain("Error: test error");
  });

  it("formats plain objects as JSON", () => {
    const log = createLogger("Test");
    log.info({ key: "value" });
    expect(consoleSpy.mock.calls[0][0]).toContain('{"key":"value"}');
  });

  it("notifies Bugsnag when an Error is logged at error level", () => {
    const mockNotify = jest.fn();
    (global as any).bugsnag = { notify: mockNotify };
    const log = createLogger("Test");
    const err = new Error("tracked");
    log.error(err);
    expect(mockNotify).toHaveBeenCalledWith(err);
    delete (global as any).bugsnag;
  });

  it("does not notify Bugsnag when no Error object is passed to error()", () => {
    const mockNotify = jest.fn();
    (global as any).bugsnag = { notify: mockNotify };
    const log = createLogger("Test");
    log.error("just a string");
    expect(mockNotify).not.toHaveBeenCalled();
    delete (global as any).bugsnag;
  });

  it("does not throw when Bugsnag is not configured", () => {
    delete (global as any).bugsnag;
    const log = createLogger("Test");
    expect(() => log.error(new Error("no bugsnag"))).not.toThrow();
  });
});
