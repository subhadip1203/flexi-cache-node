import { NodeCache } from "../src/index";
import { withMockedNow } from "./test-utils";

describe("events", () => {
    test("emits 'expired' when item expires and is swept", () => {
        const c = new NodeCache({ size: 10, stdTTL: 0, checkperiod: 0, deleteOnExpire: true });
        c.set("e", "boom", 0.05); // 50ms

        const seen: Array<{ key: string; val: any }> = [];
        c.on("expired", (k, v) => seen.push({ key: k, val: v }));

        // advance time and call sweep manually
        withMockedNow(60, () => {
            c.sweepExpired();
        });

        expect(seen).toEqual([{ key: "e", val: "boom" }]);
        expect(c.get("e")).toBeUndefined();
    });

    test("emits 'set' and 'del'", () => {
        const c = new NodeCache({ size: 10, checkperiod: 0 });
        const seen: string[] = [];
        c.on("set", (k) => seen.push(`set:${k}`));
        c.on("del", (k) => seen.push(`del:${k}`));

        c.set("a", 1);
        c.delete("a");

        expect(seen).toEqual(["set:a", "del:a"]);
    });
});
