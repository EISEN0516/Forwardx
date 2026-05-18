/**
 * SQLite ???????
 *
 * ???????????? server/repositories/*????????????????
 * ?????????? ./db ????????????????????
 */

import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { hashPassword } from "./password";
import { getDb, getSqlite, nowDate } from "./dbRuntime";
import { ensureDatabaseSchema } from "./dbSchema";

export { getDb } from "./dbRuntime";
export * from "./repositories/userRepository";
export * from "./repositories/hostRepository";
export * from "./repositories/forwardRuleRepository";
export * from "./repositories/tunnelRepository";
export * from "./repositories/metricsRepository";
export * from "./repositories/tokenRepository";
export * from "./repositories/dashboardRepository";
export * from "./repositories/forwardTestRepository";
export * from "./repositories/permissionRepository";
export * from "./repositories/settingsRepository";
export * from "./repositories/billingRepository";
export * from "./repositories/announcementRepository";

// ==================== Initialization ====================

export async function initDatabase() {
  const db = await getDb();
  const sqlite = getSqlite();
  if (!db || !sqlite) {
    console.warn("[Database] Cannot initialize: SQLite not available");
    return;
  }
  try {
    ensureDatabaseSchema(sqlite);

    // Seed or reset default admin user
    const defaultPassword = process.env.ADMIN_PASSWORD || "admin123";
    const existing = await db.select().from(users).where(eq(users.username, "admin")).limit(1);
    if (existing.length === 0) {
      const hashedPassword = hashPassword(defaultPassword);
      await db.insert(users).values({
        username: "admin",
        password: hashedPassword,
        name: "管理员",
        email: "admin@forwardx.local",
        role: "admin",
        canAddRules: true,
      });
      console.log("[Database] Default admin user created (admin / admin123)");
    } else {
      const hashedPassword = hashPassword(defaultPassword);
      await db.update(users).set({ password: hashedPassword, role: "admin", canAddRules: true, updatedAt: nowDate() }).where(eq(users.username, "admin"));
      console.log("[Database] Admin password has been reset to default");
    }
    console.log("[Database] Initialization complete");
  } catch (error) {
    console.error("[Database] Initialization failed:", error);
    throw error;
  }
}
