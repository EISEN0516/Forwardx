import { Request, Response, Router } from "express";
import { MIGRATION_TABLES, ensureDatabaseSchema } from "./dbSchema";
import { connectDatabase, executeRaw, getDatabaseKind, queryRaw } from "./dbRuntime";
import { getAllSettings, setSetting } from "./repositories/settingsRepository";
import { getHosts, getUserByUsername, requestHostAgentUpgrade } from "./db";
import { verifyPassword } from "./password";
import { pushAgentUpgrade } from "./agentEvents";
import { AGENT_VERSION } from "./_core/systemRouter";

export type MigrationJobStatus = "pending" | "running" | "success" | "failed";

export interface MigrationSnapshot {
  version: 1;
  exportedAt: number;
  sourcePanelUrl?: string;
  tables: Record<string, Record<string, any>[]>;
}

export interface MigrationJob {
  id: string;
  status: MigrationJobStatus;
  progress: number;
  step: string;
  message?: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

const jobs = new Map<string, MigrationJob>();

function normalizePanelUrl(url: string) {
  const value = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) return `http://${value}`;
  return value;
}

function setJob(job: MigrationJob, patch: Partial<MigrationJob>) {
  Object.assign(job, patch);
  jobs.set(job.id, job);
}

export function getMigrationJob(id: string) {
  return jobs.get(id) || null;
}

export async function exportMigrationSnapshot(sourcePanelUrl?: string): Promise<MigrationSnapshot> {
  await connectDatabase();
  await ensureDatabaseSchema();
  const tables: MigrationSnapshot["tables"] = {};
  for (const table of MIGRATION_TABLES) {
    tables[table] = await queryRaw(`SELECT * FROM ${quote(table)}`);
  }
  return { version: 1, exportedAt: Date.now(), sourcePanelUrl, tables };
}

function quote(name: string) {
  return getDatabaseKind() === "sqlite" ? `"${name}"` : `\`${name}\``;
}

function normalizeValue(value: any) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

export async function importMigrationSnapshot(snapshot: MigrationSnapshot, onProgress?: (progress: number, step: string) => void) {
  await connectDatabase();
  await ensureDatabaseSchema();
  const tables = MIGRATION_TABLES.filter((table) => Array.isArray(snapshot.tables?.[table]));
  onProgress?.(45, "正在清空新面板数据表");
  for (const table of [...tables].reverse()) {
    await executeRaw(`DELETE FROM ${quote(table)}`);
  }

  let done = 0;
  const total = Math.max(1, tables.reduce((sum, table) => sum + snapshot.tables[table].length, 0));
  for (const table of tables) {
    const rows = snapshot.tables[table] || [];
    onProgress?.(50 + Math.floor((done / total) * 40), `正在写入 ${table}`);
    for (const row of rows) {
      const columns = Object.keys(row).filter((key) => row[key] !== undefined);
      if (columns.length === 0) continue;
      const placeholders = columns.map(() => "?").join(", ");
      const names = columns.map((key) => quote(key)).join(", ");
      await executeRaw(
        `INSERT INTO ${quote(table)} (${names}) VALUES (${placeholders})`,
        columns.map((key) => normalizeValue(row[key])),
      );
      done += 1;
    }
  }
  onProgress?.(92, "正在恢复系统设置");
  if (!snapshot.tables.system_settings?.some((row) => row.key === "storeEnabled")) {
    await setSetting("storeEnabled", "false");
  }
}

export async function verifyAdminCredentials(username: string, password: string) {
  const user = await getUserByUsername(username);
  if (!user || user.role !== "admin") return false;
  return verifyPassword(password, user.password);
}

export async function announcePanelMigration(targetPanelUrl: string) {
  const normalized = normalizePanelUrl(targetPanelUrl);
  await setSetting("panelPublicUrl", normalized);
  const hosts = await getHosts();
  for (const host of hosts as any[]) {
    await requestHostAgentUpgrade(Number(host.id), AGENT_VERSION);
    pushAgentUpgrade(Number(host.id), AGENT_VERSION, normalized);
  }
  return { hostCount: hosts.length, panelUrl: normalized };
}

async function fetchSnapshotFromOldPanel(input: {
  oldPanelUrl: string;
  username: string;
  password: string;
  targetPanelUrl: string;
}) {
  const url = `${normalizePanelUrl(input.oldPanelUrl)}/api/migration/export`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: input.username,
      password: input.password,
      targetPanelUrl: input.targetPanelUrl,
    }),
  });
  const body = await resp.text();
  if (!resp.ok) {
    throw new Error(body || `旧面板返回 ${resp.status}`);
  }
  return JSON.parse(body) as MigrationSnapshot;
}

export function startPanelMigration(input: {
  oldPanelUrl: string;
  username: string;
  password: string;
  targetPanelUrl: string;
}) {
  const job: MigrationJob = {
    id: crypto.randomUUID(),
    status: "pending",
    progress: 0,
    step: "等待迁移开始",
    startedAt: Date.now(),
  };
  jobs.set(job.id, job);

  void (async () => {
    try {
      setJob(job, { status: "running", progress: 10, step: "正在连接旧面板" });
      const snapshot = await fetchSnapshotFromOldPanel(input);
      setJob(job, { progress: 35, step: "已获取旧面板数据，正在准备新数据库" });
      await importMigrationSnapshot(snapshot, (progress, step) => setJob(job, { progress, step }));
      setJob(job, { progress: 96, step: "正在写入新面板地址" });
      await setSetting("panelPublicUrl", normalizePanelUrl(input.targetPanelUrl));
      setJob(job, { status: "success", progress: 100, step: "迁移完成", finishedAt: Date.now() });
    } catch (error) {
      setJob(job, {
        status: "failed",
        progress: Math.max(job.progress, 1),
        step: "迁移失败",
        error: error instanceof Error ? error.message : String(error),
        finishedAt: Date.now(),
      });
    }
  })();

  return job;
}

export const migrationRouter = Router();

migrationRouter.post("/api/migration/export", async (req: Request, res: Response) => {
  try {
    const username = String(req.body?.username || "");
    const password = String(req.body?.password || "");
    const targetPanelUrl = String(req.body?.targetPanelUrl || "");
    if (!username || !password) {
      res.status(400).json({ error: "username/password required" });
      return;
    }
    if (!(await verifyAdminCredentials(username, password))) {
      res.status(401).json({ error: "管理员账户或密码错误" });
      return;
    }
    if (targetPanelUrl) {
      await announcePanelMigration(targetPanelUrl);
    }
    const settings = await getAllSettings();
    const snapshot = await exportMigrationSnapshot(settings.panelPublicUrl || undefined);
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});
