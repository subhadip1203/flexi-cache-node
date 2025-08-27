
// NodeCache: set/get + optional persistence
const NodeCache = require("flexi-cache-node");


(async () => {
    const cache = new NodeCache({ stdTTL: 5, persistPathFolder: { type: "disk", diskConfig: { folderLocation: "./cache-data" } } });
    cache.set("greeting", "hello");
    console.log("get greeting →", cache.get("greeting"));
    await cache.flush(); // writes snapshot (unencrypted)
})();