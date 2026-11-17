import { test } from "node:test";
import assert from "node:assert/strict";
import { DISCORD_MESSAGE_LIMIT, splitMessage } from "../utils/DiscordText";

function fences(text: string): number {
  return (text.match(/```/g) || []).length;
}

test("short text is a single unchanged chunk", () => {
  assert.deepEqual(splitMessage("hello"), ["hello"]);
  assert.deepEqual(splitMessage(""), [""]);
});

test("every chunk fits Discord's limit", () => {
  const inputs = [
    "line\n".repeat(2000),
    "x".repeat(10_000),
    "```\n" + "code line\n".repeat(1000) + "```\nafter",
  ];
  for (const input of inputs) {
    for (const chunk of splitMessage(input)) {
      assert.ok(chunk.length <= DISCORD_MESSAGE_LIMIT, `chunk of ${chunk.length} chars`);
    }
  }
});

test("a code block split across chunks stays balanced in each chunk", () => {
  const chunks = splitMessage("intro\n```\n" + "code line\n".repeat(1000) + "```\noutro");
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.equal(fences(chunk) % 2, 0, `unbalanced chunk: ${chunk.slice(0, 40)}`);
});

test("no text is lost when splitting plain lines", () => {
  const lines = Array.from({ length: 1500 }, (_, i) => `line ${i}`);
  const joined = splitMessage(lines.join("\n")).join("\n");
  assert.deepEqual(joined.split("\n"), lines);
});
