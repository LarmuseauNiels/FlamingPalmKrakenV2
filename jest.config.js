/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "./tsconfig.test.json",
      },
    ],
  },
  testMatch: ["**/__tests__/**/*.test.ts", "**/*.test.ts", "**/*.spec.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};
