import fs from "fs";
import path from "path";
import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import mysql, { Pool, PoolOptions } from "mysql2/promise";
import Database from "better-sqlite3";
import { SCHEMA_DIALECT } from "../drizzle/schema";
import { ENV } from "./env";

export type DatabaseKind = "mysql" | "sqlite";

export interface MysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
}

export interface SqliteConfig {
  path: string;
}

export type DatabaseConfig =
  | { type: "mysql"; mysql: MysqlConfig }
  | { type: "sqlite"; sqlite: SqliteConfig };

type Db = any;

let _kind: DatabaseKind | null = null;
let _pool: Pool | null = null;
let _sqlite: Database.Database | null = null;
let _db: Db | null = null;

export class DatabaseNotConfiguredError extends Error {
  constructor(message = "Database is not configured") {
    super(message);
    this.name = "DatabaseNotConfiguredError";
  }
}

export class DatabaseDialectMismatchError extends Error {
  constructor(
    public configuredType: DatabaseKind,
    public schemaType: DatabaseKind,
  ) {
    super(`Database type changed to ${configuredType}; server restart is required`);
    this.name = "DatabaseDialectMismatchError";
  }
}

function configFilePath() {
  return ENV.databaseConfigPath || path.resolve(process.cwd(), "data", "database.json");
}

function legacyMysqlConfigPath() {
  return ENV.mysqlConfigPath || path.resolve(process.cwd(), "data", "mysql.json");
}

export function getDatabaseConfigPath() {
  return configFilePath();
}

export function getMysqlConfigPath() {
  return legacyMysqlConfigPath();
}

export function defaultSqlitePath() {
  return ENV.sqlitePath || "/data/forwardx.db";
}

function normalizeMysql(config: MysqlConfig): MysqlConfig {
  return {
    host: config.host.trim(),
    port: Number(config.port || 3306),
    user: config.user.trim(),
    password: config.password || "",
    database: config.database.trim(),
    ssl: !!config.ssl,
  };
}

function normalizeSqlite(config: SqliteConfig): SqliteConfig {
  return {
    path: (config.path || defaultSqlitePath()).trim() || defaultSqlitePath(),
  };
}

function readMysqlFromEnv(): MysqlConfig | null {
  if (ENV.mysqlUrl) {
    const url = new URL(ENV.mysqlUrl);
    return normalizeMysql({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\/+/, ""),
      ssl: url.searchParams.get("ssl") === "true",
    });
  }
  if (ENV.mysqlHost && ENV.mysqlUser && ENV.mysqlDatabase) {
    return normalizeMysql({
      host: ENV.mysqlHost,
      port: ENV.mysqlPort,
      user: ENV.mysqlUser,
      password: ENV.mysqlPassword,
      database: ENV.mysqlDatabase,
      ssl: ENV.mysqlSsl,
    });
  }
  return null;
}

export function readDatabaseConfig(): DatabaseConfig | null {
  const explicitType = (ENV.databaseType || "").toLowerCase();
  const envMysql = readMysqlFromEnv();
  if (explicitType === "sqlite") {
    return { type: "sqlite", sqlite: normalizeSqlite({ path: defaultSqlitePath() }) };
  }
  if (explicitType === "mysql" && envMysql) {
    return { type: "mysql", mysql: envMysql };
  }
  if (envMysql) return { type: "mysql", mysql: envMysql };

  const file = configFilePath();
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed?.type === "sqlite") {
        return { type: "sqlite", sqlite: normalizeSqlite(parsed.sqlite || parsed) };
      }
      if (parsed?.type === "mysql") {
        const mysqlConfig = parsed.mysql || parsed;
        if (mysqlConfig?.host && mysqlConfig?.user && mysqlConfig?.database) {
          return { type: "mysql", mysql: normalizeMysql(mysqlConfig) };
        }
      }
    } catch {
      return null;
    }
  }

  const legacy = legacyMysqlConfigPath();
  if (fs.existsSync(legacy)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(legacy, "utf8"));
      if (parsed?.host && parsed?.user && parsed?.database) {
        return { type: "mysql", mysql: normalizeMysql(parsed) };
      }
    } catch {
      return null;
    }
  }

  if (ENV.sqlitePath && fs.existsSync(ENV.sqlitePath)) {
    return { type: "sqlite", sqlite: normalizeSqlite({ path: ENV.sqlitePath }) };
  }
  return null;
}

export function readMysqlConfig(): MysqlConfig | null {
  const config = readDatabaseConfig();
  return config?.type === "mysql" ? config.mysql : null;
}

export function maskDatabaseConfig(config: DatabaseConfig | null) {
  if (!config) return null;
  if (config.type === "sqlite") {
    return { type: "sqlite" as const, sqlite: { path: config.sqlite.path } };
  }
  return {
    type: "mysql" as const,
    mysql: {
      ...config.mysql,
      password: config.mysql.password ? "********" : "",
    },
  };
}

export function maskMysqlConfig(config: MysqlConfig | null) {
  if (!config) return null;
  return { ...config, password: config.password ? "********" : "" };
}

export function writeDatabaseConfig(config: DatabaseConfig) {
  const normalized: DatabaseConfig = config.type === "sqlite"
    ? { type: "sqlite", sqlite: normalizeSqlite(config.sqlite) }
    : { type: "mysql", mysql: normalizeMysql(config.mysql) };
  const file = configFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(normalized, null, 2), { mode: 0o600 });
}

export function writeMysqlConfig(config: MysqlConfig) {
  writeDatabaseConfig({ type: "mysql", mysql: config });
}

function poolOptions(config: MysqlConfig): PoolOptions {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: "+00:00",
    dateStrings: false,
    ssl: config.ssl ? {} : undefined,
  };
}

export async function testMysqlConnection(config: MysqlConfig) {
  const conn = await mysql.createConnection({
    ...poolOptions(normalizeMysql(config)),
    connectTimeout: 6000,
  });
  try {
    await conn.ping();
  } finally {
    await conn.end();
  }
}

export function testSqliteConnection(config: SqliteConfig) {
  const normalized = normalizeSqlite(config);
  fs.mkdirSync(path.dirname(normalized.path), { recursive: true });
  const sqlite = new Database(normalized.path);
  try {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.prepare("SELECT 1").get();
  } finally {
    sqlite.close();
  }
}

export async function testDatabaseConnection(config: DatabaseConfig) {
  if (config.type === "mysql") {
    await testMysqlConnection(config.mysql);
  } else {
    testSqliteConnection(config.sqlite);
  }
}

export async function connectDatabase(config = readDatabaseConfig()) {
  if (!config) {
    _kind = null;
    _pool = null;
    _sqlite = null;
    _db = null;
    return null;
  }
  if (_db && _kind === config.type) return _db;
  if (config.type !== SCHEMA_DIALECT) {
    throw new DatabaseDialectMismatchError(config.type, SCHEMA_DIALECT);
  }
  await closeDatabase();

  if (config.type === "mysql") {
    const normalized = normalizeMysql(config.mysql);
    _pool = mysql.createPool(poolOptions(normalized));
    await _pool.query("SELECT 1");
    _db = drizzleMysql(_pool) as Db;
    _kind = "mysql";
    console.log(`[Database] MySQL connected at ${normalized.host}:${normalized.port}/${normalized.database}`);
    return _db;
  }

  const normalized = normalizeSqlite(config.sqlite);
  fs.mkdirSync(path.dirname(normalized.path), { recursive: true });
  _sqlite = new Database(normalized.path);
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");
  _db = drizzleSqlite(_sqlite) as Db;
  _kind = "sqlite";
  console.log(`[Database] SQLite opened at ${normalized.path}`);
  return _db;
}

export async function closeDatabase() {
  if (_pool) {
    await _pool.end().catch(() => undefined);
  }
  if (_sqlite) {
    try {
      _sqlite.close();
    } catch {
      // ignore close failures during reconnect
    }
  }
  _pool = null;
  _sqlite = null;
  _db = null;
  _kind = null;
}

export async function reconnectDatabase() {
  await closeDatabase();
  return connectDatabase();
}

export async function getDb() {
  if (_db) return _db;
  return connectDatabase();
}

export function getDatabaseKind() {
  return _kind;
}

export function getConfiguredDatabaseKind() {
  return readDatabaseConfig()?.type ?? null;
}

export function getSchemaDialect() {
  return SCHEMA_DIALECT;
}

export function getPool() {
  return _pool;
}

export function getSqlite() {
  return _sqlite;
}

export function requirePool() {
  if (!_pool) throw new DatabaseNotConfiguredError("MySQL database is not connected");
  return _pool;
}

export function requireSqlite() {
  if (!_sqlite) throw new DatabaseNotConfiguredError("SQLite database is not connected");
  return _sqlite;
}

export function requireConnectedDatabase() {
  if (!_kind || !_db) throw new DatabaseNotConfiguredError();
  return { kind: _kind, db: _db, pool: _pool, sqlite: _sqlite };
}

export async function executeRaw(sqlText: string, params: any[] = []) {
  if (_kind === "mysql") {
    if (!_pool) throw new DatabaseNotConfiguredError("MySQL database is not connected");
    const [result] = await _pool.execute(sqlText, params);
    return result as any;
  }
  if (_kind === "sqlite") {
    if (!_sqlite) throw new DatabaseNotConfiguredError("SQLite database is not connected");
    return _sqlite.prepare(sqlText).run(...params);
  }
  throw new DatabaseNotConfiguredError();
}

export async function queryRaw<T = Record<string, any>>(sqlText: string, params: any[] = []): Promise<T[]> {
  if (_kind === "mysql") {
    if (!_pool) throw new DatabaseNotConfiguredError("MySQL database is not connected");
    const [rows] = await _pool.query(sqlText, params);
    return rows as T[];
  }
  if (_kind === "sqlite") {
    if (!_sqlite) throw new DatabaseNotConfiguredError("SQLite database is not connected");
    return _sqlite.prepare(sqlText).all(...params) as T[];
  }
  throw new DatabaseNotConfiguredError();
}

function normalizeRawValue(value: any) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

export async function insertAndGetId(tableName: string, values: Record<string, any>): Promise<number> {
  if (_kind === "mysql") {
    const columns = Object.keys(values).filter((key) => values[key] !== undefined);
    const placeholders = columns.map(() => "?").join(", ");
    const quoted = columns.map((key) => `\`${key}\``).join(", ");
    const result: any = await executeRaw(
      `INSERT INTO \`${tableName}\` (${quoted}) VALUES (${placeholders})`,
      columns.map((key) => normalizeRawValue(values[key])),
    );
    return Number(result?.insertId || 0);
  }
  if (_kind === "sqlite") {
    const columns = Object.keys(values).filter((key) => values[key] !== undefined);
    const placeholders = columns.map(() => "?").join(", ");
    const quoted = columns.map((key) => `"${key}"`).join(", ");
    const result: any = await executeRaw(
      `INSERT INTO "${tableName}" (${quoted}) VALUES (${placeholders})`,
      columns.map((key) => normalizeRawValue(values[key])),
    );
    return Number(result?.lastInsertRowid || 0);
  }
  throw new DatabaseNotConfiguredError();
}

export function nowDate() {
  return new Date();
}
