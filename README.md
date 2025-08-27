<p align="center">
  <img src="./assets/flexi-cache-node-logo.png" alt="flexi-cache-node logo" width="160"/>
</p>

# flexi-cache-node

> ⚡ Next-gen caching library for Node.js with **TTL**, **LRU eviction**, **tag support**, **disk persistence**, and **AES-256-GCM encryption**.  
> A modern replacement for [node-cache](https://www.npmjs.com/package/node-cache).

---

## ✨ Features

- 🕒 **TTL (Time-to-Live)** — per-key or global, with auto-expire sweeps  
- 📝 **Version history** — keep N previous values per key  
- 🏷️ **TagCache** — group keys by tags, bulk get/delete via tags  
- ♻️ **LRUCache** — automatic eviction of least-recently used keys  
- 💾 **Persistence** — save/load cache to disk (atomic, crash-safe)  
- 🔒 **AES-256-GCM encryption** — optional at-rest encryption for persisted data  
- 📊 **Stats & events** — hit/miss counts, `set`/`expired`/`del`/`clear` events  
- 🔧 **TypeScript first** — full typings included  
- 🔌 **Pluggable backends** (future: S3, GCP, Azure)  

---

## 📦 Installation

```bash
npm install flexi-cache-node
# or
yarn add flexi-cache-node
```

---

## 🚀 Quick Start

### NodeCache (basic in-memory cache with TTL)

```js
const NodeCache = require("flexi-cache-node");

const cache = new NodeCache({ stdTTL: 5 }); // default TTL = 5s
cache.set("foo", "bar");

console.log(cache.get("foo")); // "bar"

setTimeout(() => {
  console.log(cache.get("foo")); // undefined (expired)
}, 6000);
```

---

### TagCache (organize keys by tags)

```js
const { TagCache } = require("flexi-cache-node");

const tc = new TagCache();
tc.setWithTags("user:1", { name: "Alice" }, ["active", "premium"]);
tc.setWithTags("user:2", { name: "Bob" }, ["active"]);

console.log(tc.getValuesByTag("active"));
// → [ { name: "Alice" }, { name: "Bob" } ]

tc.deleteTag("premium"); // bulk remove premium users
```

---

### LRUCache (size-bounded with eviction)

```js
const { LRUCache } = require("flexi-cache-node");

const lru = new LRUCache({ size: 2 });

lru.set("a", 1);
lru.set("b", 2);
lru.get("a");   // mark a as recently used
lru.set("c", 3); // evicts "b"

console.log(lru.getKeys()); // [ 'a', 'c' ]
```

---

### Persistence (with AES-GCM encryption)

```js
const NodeCache = require("flexi-cache-node");

const cache = new NodeCache({
  stdTTL: 0,
  encryption: true,
  secretKey: process.env.CACHE_SECRET || "superSecretKey123",
  persistPathFolder: {
    type: "disk",
    diskConfig: { folderLocation: "./cache-data" }
  }
});

cache.set("sessionToken", { id: 123, scope: ["read", "write"] });
await cache.flush(); // save to disk (encrypted)
```

---

## ⚙️ Options

| Option             | Type      | Default                  | Description |
|--------------------|----------|--------------------------|-------------|
| `size`             | number   | `10000`                  | Max entries (for LRU/size check) |
| `stdTTL`           | number   | `0`                      | Default TTL in seconds (0 = no TTL) |
| `deleteOnExpire`   | boolean  | `true if TTL>0`           | Auto-delete expired entries |
| `versionHistory`   | number   | `3`                      | How many old values to keep |
| `checkperiod`      | number   | `600`                    | Expiration sweep interval (sec) |
| `backup`           | boolean  | `true`                   | Auto-persist on sweeps |
| `persistPathFolder`| object   | `{ type: "disk", ... }`   | Persistence config (currently disk only) |
| `encryption`       | boolean  | `false`                  | Enable AES-256-GCM encryption |
| `secretKey`        | string   | `""`                     | Required if encryption = true |

---

## 🔔 Events

```js
cache.on("set", (key, value) => { ... });
cache.on("del", (key) => { ... });
cache.on("clear", () => { ... });
cache.on("expired", (key, value) => { ... });
```

---

## 📊 Stats

```js
console.log(cache.getStats());
// { hits: 2, misses: 1, keys: 5 }
```

---

## 📂 Examples

See [examples/](./examples) in the repo for **3 JS** and **3 TS** usage demos:
- NodeCache basic
- TagCache tags
- LRUCache eviction
- Persistence with/without encryption

---

## 🔐 Security Notes
- Use a **strong, random secretKey** (≥ 32 chars recommended).  
- Never commit keys in code; load from environment variables or a vault.  
- Encrypted persistence format: `[IV(12) | TAG(16) | ciphertext]`.

---

## 🛠 Roadmap
- [ ] Pluggable backends: S3, GCP, Azure  
- [ ] In-memory + distributed hybrid  
- [ ] Compression for large values  

---

## 🤝 Contributing
Issues and PRs welcome!  
Check out [GitHub Issues](https://github.com/subhadip1203/flexi-cache-node/issues).  

---

## 📜 License
[MIT](./LICENSE) © 2025 [Subhadip](https://github.com/subhadip1203)
