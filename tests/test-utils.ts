import fs from "fs";
import os from "os";
import path from "path";

/** Make a unique temp dir for a test, returns absolute path. */
export function makeTempDir(prefix = "flexi-cache-test-"): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	return dir;
}

/** Recursively remove a directory if it exists. */
export function rimrafSafe(p: string) {
	try {
		if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
	} catch {
		// ignore on Windows CI oddities
	}
}

/** Simple Date.now() time travel for TTL tests. */
export function withMockedNow<T>(advanceMs: number, fn: () => T): T {
	const realNow = Date.now;
	try {
		const base = realNow();
		jest.spyOn(Date, "now").mockImplementation(() => base + advanceMs);
		return fn();
	} finally {
		(Date.now as any).mockRestore?.();
	}
}
