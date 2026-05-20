import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { ensureDatabaseSchema } from "../dbSchema";
import {
  DatabaseConfig,
  DatabaseDialectMismatchError,
  closeDatabase,
  defaultSqlitePath,
  getConfiguredDatabaseKind,
  getDatabaseKind,
  getSchemaDialect,
  maskDatabaseConfig,
  readDatabaseConfig,
  reconnectDatabase,
  testDatabaseConnection,
  writeDatabaseConfig,
} from "../dbRuntime";
import { createInitialAdmin, hasAdminUser } from "../db";
import { setSettings } from "../repositories/settingsRepository";
import { getMigrationJob, startPanelMigration } from "../migration";

const mysqlConfigInput = z.object({
  host: z.string().trim().min(1, "请输入 MySQL 地址"),
  port: z.coerce.number().int().min(1).max(65535).default(3306),
  user: z.string().trim().min(1, "请输入 MySQL 用户名"),
  password: z.string().default(""),
  database: z.string().trim().min(1, "请输入数据库名"),
  ssl: z.boolean().default(false),
});

const databaseConfigInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mysql"), mysql: mysqlConfigInput }),
  z.object({
    type: z.literal("sqlite"),
    sqlite: z.object({
      path: z.string().trim().min(1).default(defaultSqlitePath()),
    }),
  }),
]);

async function setupStatus() {
  const config = readDatabaseConfig();
  if (!config) {
    return {
      databaseConfigured: false,
      databaseConnected: false,
      databaseType: null,
      activeDatabaseType: getDatabaseKind(),
      schemaReady: false,
      hasAdmin: false,
      config: null,
      needsRestart: false,
      defaultSqlitePath: defaultSqlitePath(),
      error: null,
    };
  }

  try {
    const db = await reconnectDatabase();
    if (!db) throw new Error("数据库未连接");
    await ensureDatabaseSchema();
    return {
      databaseConfigured: true,
      databaseConnected: true,
      databaseType: config.type,
      activeDatabaseType: getDatabaseKind(),
      schemaReady: true,
      hasAdmin: await hasAdminUser(),
      config: maskDatabaseConfig(config),
      needsRestart: false,
      defaultSqlitePath: defaultSqlitePath(),
      error: null,
    };
  } catch (error) {
    const needsRestart = error instanceof DatabaseDialectMismatchError || getConfiguredDatabaseKind() !== getDatabaseKind();
    return {
      databaseConfigured: true,
      databaseConnected: false,
      databaseType: config.type,
      activeDatabaseType: getDatabaseKind(),
      schemaReady: false,
      hasAdmin: false,
      config: maskDatabaseConfig(config),
      needsRestart,
      defaultSqlitePath: defaultSqlitePath(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function saveDatabase(input: DatabaseConfig) {
  await testDatabaseConnection(input);
  writeDatabaseConfig(input);
  if (getSchemaDialect() !== input.type) {
    await closeDatabase();
    setTimeout(() => process.exit(0), 800);
    return {
      ...(await setupStatus()),
      needsRestart: true,
      databaseConfigured: true,
      databaseType: input.type,
      error: "数据库类型已切换，服务正在重启以加载对应的数据库方言",
    };
  }
  const db = await reconnectDatabase();
  if (!db) throw new Error("数据库连接未建立");
  await ensureDatabaseSchema();
  await setSettings({
    databaseConfigured: "true",
    databaseType: input.type,
    mysqlConfigured: input.type === "mysql" ? "true" : "false",
    mysqlHost: input.type === "mysql" ? input.mysql.host.trim() : "",
    mysqlDatabase: input.type === "mysql" ? input.mysql.database.trim() : "",
    sqlitePath: input.type === "sqlite" ? input.sqlite.path.trim() : "",
  });
  return setupStatus();
}

export const setupRouter = router({
  status: publicProcedure.query(async () => setupStatus()),

  testDatabase: publicProcedure
    .input(databaseConfigInput)
    .mutation(async ({ input }) => {
      await testDatabaseConnection(input as DatabaseConfig);
      return { success: true };
    }),

  saveDatabase: publicProcedure
    .input(databaseConfigInput)
    .mutation(async ({ input }) => saveDatabase(input as DatabaseConfig)),

  testMysql: publicProcedure
    .input(mysqlConfigInput)
    .mutation(async ({ input }) => {
      await testDatabaseConnection({ type: "mysql", mysql: input });
      return { success: true };
    }),

  saveMysql: publicProcedure
    .input(mysqlConfigInput)
    .mutation(async ({ input }) => saveDatabase({ type: "mysql", mysql: input })),

  startMigration: publicProcedure
    .input(z.object({
      oldPanelUrl: z.string().trim().min(1, "请输入旧面板地址"),
      username: z.string().trim().min(1, "请输入旧面板管理员账户"),
      password: z.string().min(1, "请输入旧面板管理员密码"),
      targetPanelUrl: z.string().trim().min(1, "请输入新面板访问地址"),
    }))
    .mutation(async ({ input }) => {
      await reconnectDatabase();
      await ensureDatabaseSchema();
      const job = startPanelMigration(input);
      return job;
    }),

  migrationStatus: publicProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(({ input }) => getMigrationJob(input.jobId)),

  createAdmin: publicProcedure
    .input(z.object({
      email: z.string().email("请输入有效邮箱地址").max(320),
      password: z.string().min(8, "密码至少 8 位").max(128),
      name: z.string().trim().max(64).optional(),
    }))
    .mutation(async ({ input }) => {
      await reconnectDatabase();
      await ensureDatabaseSchema();
      const id = await createInitialAdmin(input);
      return { id, success: true };
    }),
});
