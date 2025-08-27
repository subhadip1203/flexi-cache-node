// NodeCache: set/get + encrypted persistence
import NodeCache, { type CacheOptions } from "flexi-cache-node"


const opts: CacheOptions = {
stdTTL: 0,
encryption: true,
secretKey: "change_me_please", // supply via env in prod
persistPathFolder: { type: "disk", diskConfig: { folderLocation: "./cache-data" } },
};


const cache = new NodeCache(opts);
cache.set("token", { id: 123 });
console.log("token →", cache.get("token"));
await cache.flush(); // writes encrypted snapshot