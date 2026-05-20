import { desc, eq } from "drizzle-orm";
import { agentTokens, hosts, InsertAgentToken } from "../../drizzle/schema";
import { getDb, insertAndGetId, nowDate } from "../dbRuntime";

// ==================== Agent Token Queries ====================

export async function createAgentToken(data: InsertAgentToken) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return insertAndGetId("agent_tokens", data as any);
}

export async function getAgentTokenByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(agentTokens).where(eq(agentTokens.token, token)).limit(1);
  return r[0];
}

export async function getAgentTokenById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(agentTokens).where(eq(agentTokens.id, id)).limit(1);
  return r[0];
}

export async function getAgentTokens(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (userId) {
    return db.select().from(agentTokens).where(eq(agentTokens.userId, userId)).orderBy(desc(agentTokens.createdAt));
  }
  return db.select().from(agentTokens).orderBy(desc(agentTokens.createdAt));
}

export async function markAgentTokenUsed(token: string, hostId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(agentTokens).set({ isUsed: true, hostId }).where(eq(agentTokens.token, token));
}

export async function updateAgentTokenDescription(id: number, description: string | null) {
  const db = await getDb();
  if (!db) return;
  await db.update(agentTokens).set({ description }).where(eq(agentTokens.id, id));
}

export async function deleteAgentToken(id: number) {
  const db = await getDb();
  if (!db) return;
  const token = await getAgentTokenById(id);
  if (token?.token) {
    await db.update(hosts).set({
      agentToken: null,
      isOnline: false,
      updatedAt: nowDate(),
    }).where(eq(hosts.agentToken, token.token));
  }
  await db.delete(agentTokens).where(eq(agentTokens.id, id));
}

