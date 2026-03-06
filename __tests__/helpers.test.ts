import { jsonify } from "../modules/ApiFunctions/Helpers";

// authenticateToken is tested separately below via a mock for jsonwebtoken
import { authenticateToken } from "../modules/ApiFunctions/Helpers";

jest.mock("jsonwebtoken", () => ({
  verify: jest.fn(),
}));

import jwt from "jsonwebtoken";

describe("jsonify", () => {
  it("serializes a plain object to JSON", () => {
    expect(jsonify({ a: 1, b: "hello" })).toBe('{"a":1,"b":"hello"}');
  });

  it("converts BigInt values to numbers", () => {
    const result = jsonify({ id: BigInt(9007199254740991) });
    expect(result).toBe('{"id":9007199254740991}');
  });

  it("handles nested objects with BigInt", () => {
    const result = jsonify({ nested: { count: BigInt(42) } });
    expect(result).toBe('{"nested":{"count":42}}');
  });

  it("handles arrays", () => {
    expect(jsonify([1, 2, 3])).toBe("[1,2,3]");
  });

  it("handles null values", () => {
    expect(jsonify({ x: null })).toBe('{"x":null}');
  });

  it("handles an empty object", () => {
    expect(jsonify({})).toBe("{}");
  });

  it("handles a mix of BigInt and normal numbers", () => {
    const result = jsonify({ big: BigInt(100), normal: 200 });
    const parsed = JSON.parse(result);
    expect(parsed.big).toBe(100);
    expect(parsed.normal).toBe(200);
  });
});

describe("authenticateToken", () => {
  let req: any;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    req = { headers: {} };
    res = { sendStatus: jest.fn() };
    next = jest.fn();
    (jwt.verify as jest.Mock).mockReset();
  });

  it("returns 401 when Authorization header is missing", () => {
    authenticateToken(req, res, next);
    expect(res.sendStatus).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls jwt.verify when token is an empty string (not null)", () => {
    req.headers.authorization = "Bearer ";
    // empty string token is not null/undefined so jwt.verify is called,
    // but since our mock has no implementation, neither next() nor sendStatus() fires
    (jwt.verify as jest.Mock).mockImplementation(() => {
      // no-op — simulates a library that ignores empty tokens without calling cb
    });
    authenticateToken(req, res, next);
    expect(jwt.verify).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when jwt.verify calls back with an error", () => {
    req.headers.authorization = "Bearer invalidtoken";
    (jwt.verify as jest.Mock).mockImplementation((_token, _secret, cb) => {
      cb(new Error("invalid"), null);
    });
    authenticateToken(req, res, next);
    expect(res.sendStatus).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() and attaches user when token is valid", () => {
    req.headers.authorization = "Bearer validtoken";
    const mockUser = { id: "123", name: "Niels" };
    (jwt.verify as jest.Mock).mockImplementation((_token, _secret, cb) => {
      cb(null, mockUser);
    });
    authenticateToken(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual(mockUser);
    expect(res.sendStatus).not.toHaveBeenCalled();
  });
});
