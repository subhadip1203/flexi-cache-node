// LRUCache: eviction demo
import { LRUCache } from "flexi-cache-node"


const lru = new LRUCache({ size: 2 });
lru.set("x", 100);
lru.set("y", 200);
lru.get("x");
lru.set("z", 300); // evicts y
console.log("keys →", lru.getKeys());