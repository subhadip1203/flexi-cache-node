import { TagCache } from "../src/index";

describe("TagCache", () => {
    test("set/get by tag, addTagToKey, deleteTag", () => {
        const t = new TagCache({ size: 10, stdTTL: 0, checkperiod: 0 });

        t.set("p:1", { id: 1 }, 0, ["posts", "drafts"]);
        t.setWithTags("p:2", { id: 2 }, ["posts"]);
        t.addTagToKey("p:2", "featured");

        expect(new Set(t.getKeysByTag("posts"))).toEqual(new Set(["p:1", "p:2"]));
        const values = t.getValuesByTag("posts").map((v: any) => v.id).sort();
        expect(values).toEqual([1, 2]);

        t.deleteTag("drafts");
        expect(t.get("p:1")).toBeUndefined(); // evicted
        expect(t.get("p:2")).toEqual({ id: 2 });
    });

    test("tag index updates on key overwrite", () => {
        const t = new TagCache({ size: 10, checkperiod: 0 });
        t.set("k", "a", 0, ["t1"]);
        expect(t.getKeysByTag("t1")).toEqual(["k"]);
        t.set("k", "b", 0, ["t2"]); // move from t1 -> t2
        expect(t.getKeysByTag("t1")).toEqual([]);
        expect(t.getKeysByTag("t2")).toEqual(["k"]);
    });
});
