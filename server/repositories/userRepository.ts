import { and, desc, eq, sql } from "drizzle-orm";
import { InsertUser, users, forwardRules } from "../../drizzle/schema";
import { getDb, insertAndGetId, nowDate } from "../dbRuntime";
import { hashPassword, verifyPassword } from "../password";

// ==================== User Queries ====================

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return r[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return r[0];
}

export async function authenticateUser(username: string, password: string) {
  const user = await getUserByUsername(username);
  if (!user) return null;
  if (!verifyPassword(password, user.password)) return null;
  const db = await getDb();
  if (db) {
    await db.update(users).set({ lastSignedIn: nowDate(), updatedAt: nowDate() }).where(eq(users.id, user.id));
  }
  return user;
}

export async function changeUserPassword(userId: number, oldPassword: string, newPassword: string): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user) return false;
  if (!verifyPassword(oldPassword, user.password)) return false;
  const db = await getDb();
  if (!db) return false;
  await db.update(users).set({ password: hashPassword(newPassword), updatedAt: nowDate() }).where(eq(users.id, userId));
  return true;
}

export async function updateUserProfile(userId: number, data: { name?: string; email?: string }) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ ...data, updatedAt: nowDate() }).where(eq(users.id, userId));
}

export async function createUser(data: { username: string; password: string; name?: string; email?: string; role?: "user" | "admin"; canAddRules?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return insertAndGetId("users", {
    username: data.username,
    password: hashPassword(data.password),
    name: data.name ?? data.username,
    email: data.email ?? null,
    role: data.role ?? "user",
    canAddRules: data.canAddRules ?? false,
  });
}

/** 用户自行注册（默认 role=user, canAddRules=false） */
export async function registerUser(data: { username: string; password: string; name?: string; email?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return insertAndGetId("users", {
    username: data.username,
    password: hashPassword(data.password),
    name: data.name ?? data.username,
    email: data.email ?? null,
    role: "user",
    canAddRules: false,
  });
}

export async function resetUserPassword(userId: number, newPassword: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ password: hashPassword(newPassword), updatedAt: nowDate() }).where(eq(users.id, userId));
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      role: users.role,
      canAddRules: users.canAddRules,
      maxRules: users.maxRules,
      maxPorts: users.maxPorts,
      maxConnections: users.maxConnections,
      maxIPs: users.maxIPs,
      balanceCents: users.balanceCents,
      allowedForwardTypes: users.allowedForwardTypes,
      allowForwardXTunnel: users.allowForwardXTunnel,
      trafficLimit: users.trafficLimit,
      trafficUsed: users.trafficUsed,
      gostRateLimitIn: users.gostRateLimitIn,
      gostRateLimitOut: users.gostRateLimitOut,
      expiresAt: users.expiresAt,
      trafficAutoReset: users.trafficAutoReset,
      trafficResetDay: users.trafficResetDay,
      lastTrafficReset: users.lastTrafficReset,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}

export async function updateUserRole(userId: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role, updatedAt: nowDate() }).where(eq(users.id, userId));
}

export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(users).where(eq(users.id, userId));
}

/** 更新用户流量管理设置（管理员操作） */
export async function updateUserTrafficSettings(userId: number, data: {
  trafficLimit?: number;
  gostRateLimitIn?: number;
  gostRateLimitOut?: number;
  expiresAt?: Date | null;
  trafficAutoReset?: boolean;
  trafficResetDay?: number;
  canAddRules?: boolean;
  maxRules?: number;
  maxPorts?: number;
  maxConnections?: number;
  maxIPs?: number;
  allowedForwardTypes?: string | null;
  allowForwardXTunnel?: boolean;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ ...data, updatedAt: nowDate() } as any).where(eq(users.id, userId));
}

export async function setUserForwardAccess(userId: number, enabled: boolean) {
  const db = await getDb();
  if (!db) return;
  const now = nowDate();
  await db.update(users).set({
    canAddRules: enabled,
    allowForwardXTunnel: enabled,
    updatedAt: now,
  }).where(eq(users.id, userId));
  if (enabled) {
    await db.update(forwardRules).set({
      isEnabled: true,
      disabledByUser: false,
      isRunning: false,
      updatedAt: now,
    }).where(and(
      eq(forwardRules.userId, userId),
      eq(forwardRules.disabledByUser, true),
      eq(forwardRules.pendingDelete, false),
    ));
  } else {
    await db.update(forwardRules).set({
      isEnabled: false,
      disabledByUser: true,
      updatedAt: now,
    }).where(and(
      eq(forwardRules.userId, userId),
      eq(forwardRules.isEnabled, true),
      eq(forwardRules.pendingDelete, false),
    ));
  }
}

/** 手动重置用户流量 */
export async function resetUserTraffic(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({
    trafficUsed: 0,
    lastTrafficReset: nowDate(),
    updatedAt: nowDate(),
  }).where(eq(users.id, userId));
}

/** 累加用户已用流量 */
export async function addUserTraffic(userId: number, bytes: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({
    trafficUsed: sql`${users.trafficUsed} + ${bytes}`,
    updatedAt: nowDate(),
  }).where(eq(users.id, userId));
}

/** 获取所有需要月度自动重置的用户 */
export async function getUsersForAutoReset(day: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(
    and(eq(users.trafficAutoReset, true), eq(users.trafficResetDay, day))
  );
}

/** 获取所有已到期的用户 */
export async function getExpiredUsers() {
  const db = await getDb();
  if (!db) return [];
  const now = nowDate();
  return db.select().from(users).where(
    and(
      sql`${users.expiresAt} IS NOT NULL`,
      sql`${users.expiresAt} <= ${now}`
    )
  );
}

/** 禁用某用户的所有转发规则（到期/超额时调用） */
export async function disableAllUserRules(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(forwardRules).set({ isEnabled: false, isRunning: false, updatedAt: nowDate() }).where(eq(forwardRules.userId, userId));
}

/** 获取用户流量汇总信息（用于仪表盘展示） */
export async function getUserTrafficSummaries() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: users.id,
    username: users.username,
    name: users.name,
    email: users.email,
    role: users.role,
    trafficLimit: users.trafficLimit,
    trafficUsed: users.trafficUsed,
    canAddRules: users.canAddRules,
    gostRateLimitIn: users.gostRateLimitIn,
    gostRateLimitOut: users.gostRateLimitOut,
    allowForwardXTunnel: users.allowForwardXTunnel,
    expiresAt: users.expiresAt,
    trafficAutoReset: users.trafficAutoReset,
    trafficResetDay: users.trafficResetDay,
    maxConnections: users.maxConnections,
    maxIPs: users.maxIPs,
    balanceCents: users.balanceCents,
  }).from(users).orderBy(desc(users.trafficUsed));
}
