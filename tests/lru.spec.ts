import { LRUCache } from "../src/index";

describe("LRUCache", () => {
    test("evicts least-recently-used when at capacity", () => {
        const lru = new LRUCache({ size: 2, stdTTL: 0, checkperiod: 0 });
        lru.set("a", 1);
        lru.set("b", 2);
        // touch "a" so "b" becomes LRU
        expect(lru.get("a")).toBe(1);
        // add "c", should evict "b"
        lru.set("c", 3);
        expect(lru.get("b")).toBeUndefined();
        expect(lru.get("a")).toBe(1);
        expect(lru.get("c")).toBe(3);
    });

    test("get promotes key to MRU", () => {
        const lru = new LRUCache({ size: 2, checkperiod: 0 });
        lru.set("x", 1);
        lru.set("y", 2);
        // promote x
        lru.get("x");
        // insert z -> should evict y (LRU)
        lru.set("z", 3);
        expect(lru.get("y")).toBeUndefined();
        expect(lru.get("x")).toBe(1);
        expect(lru.get("z")).toBe(3);
    });
});
