import { NodeCache, OptionValidationError } from "../src/index";
import { makeTempDir, rimrafSafe, withMockedNow } from "./test-utils";
import * as path from "path";
import * as fs from "fs";

describe("NodeCache", () => {
    test("rejects bad options", () => {
        expect(() => new NodeCache({ size: -1 })).toThrow(OptionValidationError);
        expect(() => new NodeCache({ stdTTL: -5 })).toThrow(OptionValidationError);
        expect(() => new NodeCache({ checkperiod: 10 })).toThrow(OptionValidationError);
        expect(() => new NodeCache({ encryption: true, secretKey: "" })).toThrow(OptionValidationError);
    });

    test("set/get basic + stats", () => {
        const c = new NodeCache({ size: 10, checkperiod: 0 });
        c.set("a", 123);
        c.set("b", { x: 1 });

        expect(c.get("a")).toBe(123);
        expect(c.get("b")).toEqual({ x: 1 });
        expect(c.get("missing")).toBeUndefined();

        const stats = c.getStats();
        expect(stats.hits).toBe(2);
        expect(stats.misses).toBe(1);
        expect(stats.keys).toBe(2);
    });

    test("TTL expiration on get (deleteOnExpire default true when stdTTL>0)", () => {
        const c = new NodeCache({ size: 10, stdTTL: 1, checkperiod: 0 }); // 1s default TTL
        c.set("k", "v");

        // advance 1500ms
        withMockedNow(1500, () => {
            expect(c.get("k")).toBeUndefined(); // expired
            expect(c.has("k")).toBe(false);
        });
    });

    test("per-entry ttl seconds honored", () => {
        const c = new NodeCache({ size: 10, stdTTL: 0, checkperiod: 0 });
        c.set("short", "v", 0.05); // 50ms TTL

        // at t+40ms it should still exist
        withMockedNow(40, () => {
            expect(c.get("short")).toBe("v");
        });

        // at t+60ms it should be gone
        withMockedNow(60, () => {
            expect(c.get("short")).toBeUndefined();
            expect(c.has("short")).toBe(false);
        });
    });

    test("history window capped by versionHistory", () => {
        const c = new NodeCache({ size: 10, versionHistory: 2, checkperiod: 0 });
        c.set("h", 1);
        c.set("h", 2);
        c.set("h", 3);
        // history should retain [2,1] (newest first when returned)
        expect(c.getHistory("h")).toEqual([2, 1]);
        c.set("h", 4);
        expect(c.getHistory("h")).toEqual([3, 2]); // 1 dropped
    });

    test("persistence round-trip (no encryption)", async () => {
        const dir = makeTempDir();
        try {
            const persist = {
                type: "disk" as const,
                diskConfig: { folderLocation: dir, fileName: "cache.json" }
            };

            const c1 = new NodeCache({ size: 10, checkperiod: 0, backup: false, persistPathFolder: persist });
            c1.set("a", { ok: true });
            c1.set("b", 42);
            await c1.flush(); // write to disk

            // verify file exists and give FS a brief moment (Windows flakiness guard)
            const file = path.join(dir, "cache.json");
            expect(fs.existsSync(file)).toBe(true);
            await new Promise((r) => setTimeout(r, 10));

            // new instance should load
            const c2 = new NodeCache({ size: 10, checkperiod: 0, backup: false, persistPathFolder: persist });
            expect(c2.get("a")).toEqual({ ok: true });
            expect(c2.get("b")).toBe(42);
        } finally {
            rimrafSafe(dir);
        }
    });

    test("persistence round-trip (encryption on)", async () => {
        const dir = makeTempDir();
        try {
            const persist = {
                type: "disk" as const,
                diskConfig: { folderLocation: dir, fileName: "cache.enc" }
            };

            const c1 = new NodeCache({
                size: 10,
                checkperiod: 0,
                backup: false,
                persistPathFolder: persist,
                encryption: true,
                secretKey: "super-secret-123",
            });
            c1.set("secure", { token: "abc" });
            await c1.flush();

            // verify file exists and give FS a brief moment
            const file = path.join(dir, "cache.enc");
            expect(fs.existsSync(file)).toBe(true);
            await new Promise((r) => setTimeout(r, 10));

            const c2 = new NodeCache({
                size: 10,
                checkperiod: 0,
                backup: false,
                persistPathFolder: persist,
                encryption: true,
                secretKey: "super-secret-123",
            });
            expect(c2.get("secure")).toEqual({ token: "abc" });
        } finally {
            rimrafSafe(dir);
        }
    });
});
