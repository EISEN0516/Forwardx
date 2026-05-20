import { eq } from "drizzle-orm";
import { systemSettings } from "../../drizzle/schema";
import { executeRaw, getDatabaseKind, getDb } from "../dbRuntime";

// ==================== System Settings (key-value) ====================

/** 璇诲彇鍗曚釜绯荤粺璁剧疆锛涗笉瀛樺湪杩斿洖 null */
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const r = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  return r[0]?.value ?? null;
}

/** 鎵归噺璇诲彇鎵€鏈夌郴缁熻缃?*/
export async function getAllSettings(): Promise<Record<string, string | null>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(systemSettings);
  const out: Record<string, string | null> = {};
  for (const r of rows) out[r.key] = r.value ?? null;
  return out;
}

/** UPSERT 鍗曚釜绯荤粺璁剧疆 */
export async function setSetting(key: string, value: string | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const nowSec = Math.floor(Date.now() / 1000);
  if (getDatabaseKind() === "sqlite") {
    await executeRaw(
      "INSERT INTO system_settings (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=excluded.updatedAt",
      [key, value, nowSec],
    );
  } else {
    await executeRaw(
      "INSERT INTO system_settings (`key`, value, updatedAt) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value), updatedAt=VALUES(updatedAt)",
      [key, value, nowSec],
    );
  }
}
/** 鎵归噺 UPSERT */
export async function setSettings(map: Record<string, string | null>): Promise<void> {
  for (const [k, v] of Object.entries(map)) {
    await setSetting(k, v);
  }
}

