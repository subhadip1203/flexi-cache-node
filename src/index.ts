import { existsSync, readFileSync, promises as fsPromises } from "fs";
import * as path from "path";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { EventEmitter } from "events";

/* =========================================================================================
 * Error types
 * =======================================================================================*/

/** Base error for all cache-related exceptions. */
export class CacheError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CacheError";
  }
}

/** Thrown when provided options are invalid or contradictory. */
export class OptionValidationError extends CacheError {
  constructor(message: string) {
    super(message);
    this.name = "OptionValidationError";
  }
}

/** Thrown for persistence I/O failures (save/load). */
export class PersistenceError extends CacheError {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceError";
  }
}

/** Thrown when encryption/decryption fails or pre-conditions are not met. */
export class EncryptionError extends CacheError {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionError";
  }
}

/* =========================================================================================
 * Types
 * =======================================================================================*/

export type StorageType = "disk" | "s3" | "gcp-storage" | "azure";

/** Persistence configuration (currently only `"disk"` is implemented). */
export type PersistConfig = {
  type: StorageType;
  diskConfig?: {
    /** Folder path for storing cache files. */
    folderLocation: string;
    /** Optional custom file name for the cache file. */
    fileName?: string;
  };
  // placeholders (not implemented)
  s3_config?: any;
  gcp_storage?: any;
  azure_config?: any;
};

/** Runtime options for the cache. */
export type CacheOptions = {
  /** Maximum number of keys in cache. Default: 10_000. Must be > 0. */
  size?: number;
  /** Default TTL in seconds for new entries. 0 = no TTL. Default: 0. */
  stdTTL?: number;
  /** Delete entries immediately on expiration. Default: stdTTL>0 ? true : false. */
  deleteOnExpire?: boolean;
  /** How many historical values to retain per key. Default: 3. */
  versionHistory?: number;
  /** Periodic sweep/check in seconds (>=30 or 0 to disable). Default: 600. */
  checkperiod?: number;
  /** Enable periodic backups (persist to disk during sweeps). Default: true. */
  backup?: boolean;
  /** Persistence configuration. Default: { type: "disk", "./node-cache-backup/" }. */
  persistPathFolder?: PersistConfig;
  /** AES-256-GCM encryption for persisted bytes. Default: false. */
  encryption?: boolean;
  /** Secret for encryption (required if encryption=true). */
  secretKey?: string;
};

/** Internal structure kept for each key. */
export type CacheEntry = {
  /** User value. JSON-serializable if you enable persistence. */
  value: any;
  /** TTL in milliseconds (undefined means infinite). */
  ttl?: number;
  /** Tags for tag-based operations. */
  tags: Set<string>;
  /** FIFO history of previous values. */
  history: any[];
  /** Creation timestamp (ms since epoch). */
  createdAt: number;
};

/* =========================================================================================
 * Utilities: crypto & persistence
 * =======================================================================================*/

/**
 * Derive a 256-bit key from a string by SHA-256.
 * @param key - Input passphrase/secret.
 * @returns 32-byte Buffer.
 */
export function deriveKey(key: string): Buffer {
  return createHash("sha256").update(key).digest();
}

/**
 * Encrypt bytes with AES-256-GCM.
 * Layout of output: [IV(12) | TAG(16) | CIPHERTEXT].
 * @param data - Plain bytes to encrypt.
 * @param key - 32-byte key (e.g., from `deriveKey`).
 */
export function encrypt(data: Buffer, key: Buffer): Buffer {
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]);
  } catch (e: any) {
    throw new EncryptionError(`Encryption failed: ${e?.message ?? e}`);
  }
}

/**
 * Decrypt bytes produced by `encrypt`.
 * @param data - Encrypted payload [IV | TAG | CIPHERTEXT].
 * @param key - 32-byte key.
 */
export function decrypt(data: Buffer, key: Buffer): Buffer {
  try {
    const iv = data.slice(0, 12);
    const tag = data.slice(12, 28);
    const ct = data.slice(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch (e: any) {
    throw new EncryptionError(`Decryption failed (wrong key or corrupted data): ${e?.message ?? e}`);
  }
}

/**
 * Persist the store to disk atomically (write .tmp then rename).
 * Converts Set tags -> arrays for JSON.
 *
 * @throws PersistenceError if any filesystem or serialization error occurs.
 */
export async function saveToDiskAsync(
  store: Map<string, CacheEntry>,
  persistPathFolder: PersistConfig,
  encryption: boolean,
  secretKey?: string
): Promise<void> {
  if (persistPathFolder.type !== "disk") return;

  const dir = persistPathFolder.diskConfig?.folderLocation ?? "./node-cache-backup/";
  const defaultFileName = encryption ? "cache-backup.encrypted.data" : "cache-backup.json";
  const fileName = persistPathFolder.diskConfig?.fileName ?? defaultFileName;
  const filePath = path.join(dir, fileName);
  const tmpPath = `${filePath}.tmp`;

  try {
    if (!existsSync(dir)) await fsPromises.mkdir(dir, { recursive: true });

    // Serialize entries with tag Sets -> arrays
    const arr = Array.from(store.entries()).map(([k, v]) => [k, { ...v, tags: Array.from(v.tags) }]);
    const json = JSON.stringify(arr);
    const buf = encryption ? encrypt(Buffer.from(json, "utf8"), deriveKey(secretKey!)) : Buffer.from(json, "utf8");

    await fsPromises.writeFile(tmpPath, buf);
    await fsPromises.rename(tmpPath, filePath);
  } catch (e: any) {
    throw new PersistenceError(`Failed to save cache to "${filePath}": ${e?.message ?? e}`);
  }
}

/**
 * Load a store from disk (if present). If encrypted, attempts decryption with `secretKey`.
 *
 * @returns Map<string, CacheEntry> or undefined if file not present.
 * @throws PersistenceError on I/O or parse errors; EncryptionError on bad decryption.
 */
export function loadFromDisk(
  persistPathFolder: PersistConfig,
  encryption: boolean,
  secretKey?: string
): Map<string, CacheEntry> | undefined {
  if (persistPathFolder.type !== "disk") return;

  const dir = persistPathFolder.diskConfig?.folderLocation ?? "./node-cache-backup/";
  const defaultFileName = encryption ? "cache-backup.encrypted.data" : "cache-backup.json";
  const fileName = persistPathFolder.diskConfig?.fileName ?? defaultFileName;
  const filePath = path.join(dir, fileName);

  if (!existsSync(filePath)) return;
  try {
    const raw = readFileSync(filePath);
    const txt = encryption ? decrypt(raw, deriveKey(secretKey!)).toString("utf8") : raw.toString("utf8");
    const arr = JSON.parse(txt) as [string, Omit<CacheEntry, "tags"> & { tags: string[] }][];
    const map = new Map<string, CacheEntry>();
    for (const [k, v] of arr) {
      map.set(k, { ...v, tags: new Set(v.tags) });
    }
    return map;
  } catch (e: any) {
    if (e instanceof EncryptionError) throw e;
    throw new PersistenceError(`Failed to load cache from "${filePath}": ${e?.message ?? e}`);
  }
}

/* =========================================================================================
 * Validation
 * =======================================================================================*/

/** Validate & normalize user options, producing a fully-populated options object. */
function validateOptions(opts: CacheOptions = {}): Required<
  Omit<CacheOptions, "persistPathFolder" | "secretKey" | "encryption" | "backup">
> & {
  persistPathFolder?: PersistConfig;
  encryption: boolean;
  secretKey: string;
  backup: boolean;
} {
  if (opts.size !== undefined && (!Number.isFinite(opts.size) || opts.size <= 0)) {
    throw new OptionValidationError(`"size" must be a positive finite number (got ${opts.size})`);
  }
  if (opts.stdTTL !== undefined && (!Number.isFinite(opts.stdTTL) || opts.stdTTL < 0)) {
    throw new OptionValidationError(`"stdTTL" must be a non-negative number of seconds (got ${opts.stdTTL})`);
  }
  if (opts.versionHistory !== undefined && (!Number.isInteger(opts.versionHistory) || opts.versionHistory < 0)) {
    throw new OptionValidationError(`"versionHistory" must be a non-negative integer (got ${opts.versionHistory})`);
  }
  if (opts.checkperiod !== undefined) {
    if (!Number.isInteger(opts.checkperiod) || opts.checkperiod < 0) {
      throw new OptionValidationError(`"checkperiod" must be 0 or a positive integer (got ${opts.checkperiod})`);
    }
    if (opts.checkperiod > 0 && opts.checkperiod < 30) {
      throw new OptionValidationError(`"checkperiod" must be at least 30 seconds when enabled (got ${opts.checkperiod})`);
    }
  }
  if (opts.persistPathFolder) {
    if (opts.persistPathFolder.type !== "disk") {
      throw new OptionValidationError(`Only "disk" persistence is implemented (got "${opts.persistPathFolder.type}")`);
    }
    const folder = opts.persistPathFolder.diskConfig?.folderLocation;
    if (!folder || typeof folder !== "string" || !folder.trim()) {
      throw new OptionValidationError(`"persistPathFolder.diskConfig.folderLocation" must be a non-empty string`);
    }
  }
  if (opts.encryption) {
    const sec = opts.secretKey ?? "";
    if (typeof sec !== "string" || sec.length < 8) {
      throw new OptionValidationError(`"secretKey" must be a string of length >= 8 when "encryption" is true`);
    }
  }

  const stdTTL = opts.stdTTL ?? 0;
  const deleteOnExpire = opts.deleteOnExpire ?? (stdTTL !== 0);
  return {
    size: opts.size ?? 10_000,
    stdTTL,
    deleteOnExpire,
    versionHistory: opts.versionHistory ?? 3,
    checkperiod: opts.checkperiod ?? 600,
    encryption: opts.encryption ?? false,
    secretKey: opts.secretKey ?? "",
    backup: opts.backup ?? true,
    persistPathFolder:
      opts.persistPathFolder ??
      ({
        type: "disk",
        diskConfig: { folderLocation: "./node-cache-backup/" },
      } as PersistConfig),
  };
}

/* =========================================================================================
 * NodeCache (base)
 * =======================================================================================*/

/**
 * Node-only cache with TTL, value history, optional periodic persistence (disk),
 * and optional AES-256-GCM encryption for persisted bytes.
 *
 * - Values can be **any** JS values, but if persistence is enabled they must be **JSON-serializable**.
 * - TTL is checked on read and during periodic sweeps.
 * - Emits events: `"set" (key, value)`, `"del" (key)`, `"clear" ()`, `"expired" (key, value)`.
 */
export class NodeCache extends EventEmitter {
  /** Main key/value store (in-memory). */
  protected store: Map<string, CacheEntry> = new Map();

  /** Validated, fully-populated options. */
  protected options = validateOptions();

  /** Periodic sweep/backup timer. */
  private checkInterval: NodeJS.Timeout | null = null;

  /** Simple stats. */
  private stats = { hits: 0, misses: 0, keys: 0 };

  constructor(options: CacheOptions = {}) {
    super();
    this.options = validateOptions(options);

    // Attempt to load persisted data (best-effort).
    if (this.options.persistPathFolder?.type === "disk") {
      const loaded = loadFromDisk(this.options.persistPathFolder, this.options.encryption, this.options.secretKey);
      if (loaded) this.store = loaded;
    }

    // Start periodic sweeper if enabled.
    if (this.options.checkperiod > 0) {
      this.checkInterval = setInterval(() => this.sweepExpired(), this.options.checkperiod * 1000);
    }
  }

  /**
   * Set a key/value pair.
   *
   * @param key - Cache key (string).
   * @param value - Any JS value. If persistence is on, it must be JSON-serializable.
   * @param ttl - Override TTL (seconds) for this write; default = `stdTTL`.
   * @param tags - Optional tags (used by `TagCache` and tag ops).
   */
  set(key: string, value: any, ttl?: number, tags: string[] = []): void {
    if (this.store.size >= this.options.size && !this.store.has(key)) {
      throw new CacheError(`Cache size limit of ${this.options.size} exceeded`);
    }

    const now = Date.now();
    const effectiveTTLms = (ttl ?? this.options.stdTTL) * 1000;

    const prev = this.store.get(key);
    const history = prev ? [...prev.history] : [];
    if (prev) {
      history.push(prev.value);
      while (history.length > this.options.versionHistory) history.shift();
    }

    this.store.set(key, {
      value,
      ttl: effectiveTTLms || undefined,
      tags: new Set(tags),
      history,
      createdAt: now,
    });

    this.stats.keys = this.store.size;
    this.emit("set", key, value);
  }

  /**
   * Get a value if it exists and hasn’t expired.
   *
   * @param key - Cache key.
   * @returns The stored value, or `undefined` if missing or expired.
   */
  get(key: string): any | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    if (entry.ttl && Date.now() > entry.createdAt + entry.ttl) {
      if (this.options.deleteOnExpire) this.delete(key);
      this.stats.misses++;
      return undefined;
    }

    this.stats.hits++;
    return entry.value;
  }

  /** Check existence **and validity** of a key. */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /** Delete a key (no-op if missing). */
  delete(key: string): boolean {
    const removed = this.store.delete(key);
    if (removed) {
      this.stats.keys = this.store.size;
      this.emit("del", key);
    }
    return removed;
  }

  /** Clear the entire cache (does not delete persisted file). */
  clear(): void {
    this.store.clear();
    this.stats.keys = 0;
    this.emit("clear");
  }

  /** Remaining TTL (seconds) or `undefined` (none/expired). */
  getTTL(key: string): number | undefined {
    const e = this.store.get(key);
    if (!e || !e.ttl) return undefined;
    const remainingMs = e.createdAt + e.ttl - Date.now();
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : undefined;
  }

  /** Get a copy of simple statistics. */
  getStats() {
    return { ...this.stats, keys: this.store.size };
  }

  /** List all keys currently stored. */
  getKeys(): string[] {
    return [...this.store.keys()];
  }

  /** Historical values for a key (newest first). */
  getHistory(key: string): any[] {
    return this.store.get(key)?.history.slice().reverse() ?? [];
  }

  /**
   * Force-save the current store to disk (when persistence enabled).
   * NOTE: This now **always writes** if `persistPathFolder.type === "disk"`, regardless of `backup`.
   */
  async flush(): Promise<void> {
    if (this.options.persistPathFolder?.type === "disk") {
      await saveToDiskAsync(
        this.store,
        this.options.persistPathFolder,
        this.options.encryption,
        this.options.secretKey
      );
    }
  }

  /**
   * Sweep expired entries and, if `backup` is on, perform a periodic autosave.
   */
  sweepExpired(): void {
    const now = Date.now();
    for (const [key, value] of this.store) {
      if (value.ttl && now > value.createdAt + value.ttl && this.options.deleteOnExpire) {
        this.store.delete(key);
        this.emit("expired", key, value.value);
      }
    }
    this.stats.keys = this.store.size;

    if (this.options.backup && this.options.persistPathFolder?.type === "disk") {
      saveToDiskAsync(
        this.store,
        this.options.persistPathFolder,
        this.options.encryption,
        this.options.secretKey
      ).catch((e) => {
        // periodic backups are best-effort
        console.error(`[flexi-cache-node] backup failed: ${e?.message ?? e}`);
      });
    }
  }

  /** Stop the periodic sweeper (call on shutdown). */
  destroy(): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
  }
}

/* =========================================================================================
 * TagCache (adds tag-centric operations to NodeCache)
 * =======================================================================================*/

export class TagCache extends NodeCache {
  /** Tag index: tag -> keys that carry it. */
  private tagMap = new Map<string, Set<string>>();

  /** Set a key with tags. */
  override set(key: string, value: any, ttl?: number, tags: string[] = []): void {
    // Remove key from old tags if updating
    const existing = (this as any).store.get(key) as CacheEntry | undefined;
    if (existing) {
      for (const tag of existing.tags) {
        const set = this.tagMap.get(tag);
        if (set) {
          set.delete(key);
          if (set.size === 0) this.tagMap.delete(tag);
        }
      }
    }

    super.set(key, value, ttl, tags);

    // Add key to new tags
    for (const tag of tags) {
      if (!this.tagMap.has(tag)) this.tagMap.set(tag, new Set());
      this.tagMap.get(tag)!.add(key);
    }
  }

  /** Convenience wrapper for clarity in callers. */
  setWithTags(key: string, value: any, tags: string[], ttl?: number): void {
    this.set(key, value, ttl, tags);
  }

  /** Add a single tag to an existing key (no-op if key missing). */
  addTagToKey(key: string, tag: string): void {
    const entry = (this as any).store.get(key) as CacheEntry | undefined;
    if (!entry) return;
    entry.tags.add(tag);
    if (!this.tagMap.has(tag)) this.tagMap.set(tag, new Set());
    this.tagMap.get(tag)!.add(key);
  }

  /** Remove a key (and update tag index accordingly). */
  override delete(key: string): boolean {
    const entry = (this as any).store.get(key) as CacheEntry | undefined;
    if (entry) {
      for (const tag of entry.tags) {
        const set = this.tagMap.get(tag);
        if (set) {
          set.delete(key);
          if (set.size === 0) this.tagMap.delete(tag);
        }
      }
    }
    return super.delete(key);
  }

  /** Get all keys carrying a tag. */
  getKeysByTag(tag: string): string[] {
    return [...(this.tagMap.get(tag) || [])];
  }

  /** Get all **non-expired** values for a tag (skips undefined). */
  getValuesByTag(tag: string): any[] {
    const out: any[] = [];
    for (const k of this.getKeysByTag(tag)) {
      const v = this.get(k);
      if (v !== undefined) out.push(v);
    }
    return out;
  }

  /** Delete all keys that carry a tag (and drop the tag index). */
  deleteTag(tag: string): void {
    const keys = this.tagMap.get(tag);
    if (!keys) return;
    for (const k of [...keys]) this.delete(k);
    this.tagMap.delete(tag);
  }

  /** Clear tag index when clearing the cache. */
  override clear(): void {
    super.clear();
    this.tagMap.clear();
  }
}

/* =========================================================================================
 * LRUCache (adds LRU eviction policy to NodeCache)
 * =======================================================================================*/

interface LRUNode {
  key: string;
  prev?: LRUNode | null;
  next?: LRUNode | null;
}

/**
 * LRUCache extends `NodeCache` with a classic LRU eviction strategy.
 * - On `set`, if capacity is reached and the key is new, evicts the LRU key.
 * - On `get`, promotes the key to MRU position.
 */
export class LRUCache extends NodeCache {
  /** Most recently used. */
  private head: LRUNode | null = null;
  /** Least recently used. */
  private tail: LRUNode | null = null;
  /** Quick key->node lookup. */
  private nodes = new Map<string, LRUNode>();

  /** Link node as the head (MRU). */
  private linkAsHead(node: LRUNode) {
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  /** Unlink a node from the list. */
  private unlink(node: LRUNode) {
    if (node.prev) node.prev.next = node.next ?? null;
    if (node.next) node.next.prev = node.prev ?? null;
    if (this.head === node) this.head = node.next ?? null;
    if (this.tail === node) this.tail = node.prev ?? null;
    node.prev = node.next = null;
  }

  /** Move a key to MRU if it exists. */
  private touch(key: string) {
    const node = this.nodes.get(key);
    if (!node || node === this.head) return;
    this.unlink(node);
    this.linkAsHead(node);
  }

  /** Set a key/value pair (evicting LRU if at capacity and key is new). */
  override set(key: string, value: any, ttl?: number, tags: string[] = []): void {
    const store = (this as any).store as Map<string, CacheEntry>;
    const sizeLimit = (this as any).options.size as number;

    if (store.size >= sizeLimit && !store.has(key)) {
      if (this.tail) this.delete(this.tail.key);
    }

    super.set(key, value, ttl, tags);

    if (this.nodes.has(key)) {
      this.touch(key);
    } else {
      const node: LRUNode = { key, prev: null, next: null };
      this.nodes.set(key, node);
      this.linkAsHead(node);
    }
  }

  /** Get then mark as MRU if present. */
  override get(key: string): any {
    const v = super.get(key);
    if (v !== undefined) this.touch(key);
    return v;
  }

  /** Delete and unlink from LRU list. */
  override delete(key: string): boolean {
    const ok = super.delete(key);
    const node = this.nodes.get(key);
    if (node) {
      this.unlink(node);
      this.nodes.delete(key);
    }
    return ok;
  }

  /** Remove expired entries and clean up any orphan LRU nodes. */
  override sweepExpired(): void {
    super.sweepExpired();
    const store = (this as any).store as Map<string, CacheEntry>;
    const toDrop: string[] = [];
    for (const [k, node] of this.nodes) {
      if (!store.has(k)) {
        this.unlink(node);
        toDrop.push(k);
      }
    }
    for (const k of toDrop) this.nodes.delete(k);
  }

  /** Clear both cache and LRU structures. */
  override clear(): void {
    super.clear();
    this.head = this.tail = null;
    this.nodes.clear();
  }
}

/* =========================================================================================
 * Exports
 * =======================================================================================*/

// default export for people who just want a drop-in NodeCache
export default NodeCache;
