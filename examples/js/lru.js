// LRUCache: capacity=2, evict least‑recently used
const { LRUCache } = require("flexi-cache-node")


const lru = new LRUCache({ size: 2 });
lru.set("a", 1);
lru.set("b", 2);
lru.get("a"); // promote a
lru.set("c", 3); // evicts b
console.log("keys →", lru.getKeys()); // ["c","a"] (order may vary)