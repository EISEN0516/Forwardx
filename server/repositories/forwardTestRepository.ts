import { and, desc, eq } from "drizzle-orm";
import { forwardTests, InsertForwardTest, tunnelLatencyStats } from "../../drizzle/schema";
import { getDb, insertAndGetId, nowDate } from "../dbRuntime";

// ==================== Forward Tests ====================

export async function createForwardTest(data: InsertForwardTest) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return insertAndGetId("forward_tests", data as any);
}

export async function getPendingForwardTestsByHost(hostId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(forwardTests)
    .where(and(eq(forwardTests.hostId, hostId), eq(forwardTests.status, "pending")));
}

export async function markForwardTestRunning(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(forwardTests).set({ status: "running", updatedAt: nowDate() }).where(eq(forwardTests.id, id));
}

export async function updateForwardTestResult(
  id: number,
  data: {
    status: "success" | "failed" | "timeout";
    listenOk?: boolean;
    targetReachable?: boolean;
    forwardOk?: boolean;
    latencyMs?: number | null;
    message?: string | null;
  }
) {
  const db = await getDb();
  if (!db) return;
  await db.update(forwardTests).set({ ...data, updatedAt: nowDate() } as any).where(eq(forwardTests.id, id));
}

export async function getLatestTunnelLatency(tunnelId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(tunnelLatencyStats)
    .where(eq(tunnelLatencyStats.tunnelId, tunnelId))
    .orderBy(desc(tunnelLatencyStats.recordedAt))
    .limit(1);
  return rows[0];
}

export async function getLatestForwardTest(ruleId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(forwardTests)
    .where(eq(forwardTests.ruleId, ruleId))
    .orderBy(desc(forwardTests.createdAt))
    .limit(1);
  return rows[0];
}

export async function getForwardTestById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(forwardTests).where(eq(forwardTests.id, id)).limit(1);
  return rows[0];
}

