export function jsonify(obj) {
  return JSON.stringify(obj, (key, value) =>
    typeof value === "bigint" ? Number(value) : value
  );
}
