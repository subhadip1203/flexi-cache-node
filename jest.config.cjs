/** @type {import('jest').Config} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/tests"],
    testMatch: ["**/?(*.)+(spec|test).ts"],
    moduleFileExtensions: ["ts", "js", "json"],
    transform: {
        "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.base.json" }]
    },
    clearMocks: true
};
