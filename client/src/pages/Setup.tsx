import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Database, Loader2, MoveRight, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";

type DatabaseType = "mysql" | "sqlite";
type SetupMode = "new" | "migrate" | null;

export default function Setup() {
  const utils = trpc.useUtils();
  const status = trpc.setup.status.useQuery(undefined, { refetchOnWindowFocus: false, retry: false, refetchInterval: 3000 });
  const defaultSqlitePath = status.data?.defaultSqlitePath || "/data/forwardx.db";
  const [databaseType, setDatabaseType] = useState<DatabaseType>("sqlite");
  const [mode, setMode] = useState<SetupMode>(null);
  const [mysql, setMysql] = useState({
    host: "127.0.0.1",
    port: 3306,
    user: "forwardx",
    password: "",
    database: "forwardx",
    ssl: false,
  });
  const [sqlitePath, setSqlitePath] = useState(defaultSqlitePath);
  const [admin, setAdmin] = useState({ email: "", password: "", name: "" });
  const [migration, setMigration] = useState({ oldPanelUrl: "", username: "", password: "", targetPanelUrl: window.location.origin });
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!sqlitePath || sqlitePath === "/data/forwardx.db") setSqlitePath(defaultSqlitePath);
  }, [defaultSqlitePath]);

  const databaseConfig = useMemo(() => (
    databaseType === "mysql"
      ? { type: "mysql" as const, mysql }
      : { type: "sqlite" as const, sqlite: { path: sqlitePath || defaultSqlitePath } }
  ), [databaseType, defaultSqlitePath, mysql, sqlitePath]);

  const saveDatabase = trpc.setup.saveDatabase.useMutation({
    onSuccess: async (data) => {
      if (data?.needsRestart) {
        toast.info("数据库类型已保存，服务正在重启，请稍后刷新页面");
      } else {
        toast.success("数据库连接成功，结构已准备好");
      }
      await utils.setup.status.invalidate();
    },
    onError: (error) => toast.error(error.message || "数据库连接失败"),
  });

  const testDatabase = trpc.setup.testDatabase.useMutation({
    onSuccess: () => toast.success("数据库连通性正常"),
    onError: (error) => toast.error(error.message || "数据库连通性检查失败"),
  });

  const createAdmin = trpc.setup.createAdmin.useMutation({
    onSuccess: async () => {
      toast.success("管理员账户已创建，请登录");
      await utils.setup.status.invalidate();
      window.location.href = "/login";
    },
    onError: (error) => toast.error(error.message || "创建管理员失败"),
  });

  const startMigration = trpc.setup.startMigration.useMutation({
    onSuccess: (job) => {
      setJobId(job.id);
      toast.success("迁移任务已开始");
    },
    onError: (error) => toast.error(error.message || "启动迁移失败"),
  });
  const migrationStatus = trpc.setup.migrationStatus.useQuery(
    { jobId: jobId || "" },
    { enabled: !!jobId, refetchInterval: (query) => query.state.data?.status === "success" || query.state.data?.status === "failed" ? false : 1200 },
  );

  useEffect(() => {
    if (migrationStatus.data?.status === "success") {
      toast.success("迁移完成，请使用旧面板账户登录");
      setTimeout(() => { window.location.href = "/login"; }, 1000);
    }
    if (migrationStatus.data?.status === "failed") {
      toast.error(migrationStatus.data.error || "迁移失败");
    }
  }, [migrationStatus.data?.status]);

  const data = status.data;
  const dbReady = !!data?.databaseConnected && !!data?.schemaReady;
  const hasAdmin = !!data?.hasAdmin;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eaf6ff_0,#f8fbff_40%,#ffffff_100%)] px-4 py-8 text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="text-center">
          <img src="/logo-light.png" alt="ForwardX" className="mx-auto h-14 w-14 object-contain dark:hidden" />
          <img src="/logo-dark.png" alt="ForwardX" className="mx-auto hidden h-14 w-14 object-contain dark:block" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">ForwardX 首次部署</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            选择数据库，决定新建面板或从旧面板迁移。迁移会自动转换 SQLite/MySQL 数据并同步 Agent 面板地址。
          </p>
        </div>

        {data?.error && (
          <Alert variant={data.needsRestart ? "default" : "destructive"}>
            <AlertTitle>{data.needsRestart ? "等待服务重启" : "数据库连接异常"}</AlertTitle>
            <AlertDescription>{data.error}</AlertDescription>
          </Alert>
        )}

        <Card className="border-white/60 bg-white/80 shadow-xl shadow-sky-100/70 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" />
              1. 选择数据库
            </CardTitle>
            <CardDescription>SQLite 适合轻量部署，MySQL 适合生产和多实例环境。选择后仍可通过面板迁移转换。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {(["sqlite", "mysql"] as DatabaseType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setDatabaseType(type)}
                  className={`rounded-lg border p-4 text-left transition ${databaseType === type ? "border-sky-400 bg-sky-50 shadow-sm" : "border-border bg-white/70 hover:border-sky-200"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{type === "sqlite" ? "SQLite 本地数据库" : "MySQL 外部数据库"}</div>
                    {databaseType === type && <CheckCircle2 className="h-4 w-4 text-sky-600" />}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {type === "sqlite" ? "无需额外数据库服务，适合单机快速部署。" : "使用独立数据库，便于备份、运维和跨机器迁移。"}
                  </p>
                </button>
              ))}
            </div>

            {databaseType === "sqlite" ? (
              <div className="space-y-2">
                <Label>SQLite 数据文件</Label>
                <Input value={sqlitePath} onChange={(e) => setSqlitePath(e.target.value)} placeholder={defaultSqlitePath} />
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                  <div className="space-y-2">
                    <Label>地址</Label>
                    <Input value={mysql.host} onChange={(e) => setMysql({ ...mysql, host: e.target.value })} placeholder="127.0.0.1" />
                  </div>
                  <div className="space-y-2">
                    <Label>端口</Label>
                    <Input type="number" min={1} max={65535} value={mysql.port} onChange={(e) => setMysql({ ...mysql, port: Number(e.target.value || 3306) })} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>数据库名</Label>
                    <Input value={mysql.database} onChange={(e) => setMysql({ ...mysql, database: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>用户名</Label>
                    <Input value={mysql.user} onChange={(e) => setMysql({ ...mysql, user: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>密码</Label>
                  <Input type="password" value={mysql.password} onChange={(e) => setMysql({ ...mysql, password: e.target.value })} />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border/50 bg-white/70 p-3">
                  <div>
                    <p className="text-sm font-medium">启用 SSL</p>
                    <p className="text-xs text-muted-foreground">远程数据库或云数据库可按需开启。</p>
                  </div>
                  <Switch checked={mysql.ssl} onCheckedChange={(ssl) => setMysql({ ...mysql, ssl })} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" disabled={testDatabase.isPending} onClick={() => testDatabase.mutate(databaseConfig)}>
                {testDatabase.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                检查连接
              </Button>
              <Button disabled={saveDatabase.isPending} onClick={() => saveDatabase.mutate(databaseConfig)}>
                {saveDatabase.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存数据库
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={!dbReady ? "opacity-60" : "border-white/60 bg-white/80 shadow-xl shadow-sky-100/70 backdrop-blur-xl"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" />
              2. 新建或迁移
            </CardTitle>
            <CardDescription>数据库准备好后，可以作为新面板使用，也可以从旧面板无缝迁移。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <button disabled={!dbReady} type="button" onClick={() => setMode("new")} className={`rounded-lg border p-4 text-left transition ${mode === "new" ? "border-emerald-400 bg-emerald-50" : "border-border bg-white/70"}`}>
                <div className="font-semibold">作为新面板使用</div>
                <p className="mt-2 text-sm text-muted-foreground">创建新的管理员账户，使用空数据库开始。</p>
              </button>
              <button disabled={!dbReady} type="button" onClick={() => setMode("migrate")} className={`rounded-lg border p-4 text-left transition ${mode === "migrate" ? "border-sky-400 bg-sky-50" : "border-border bg-white/70"}`}>
                <div className="font-semibold">从旧面板迁移恢复</div>
                <p className="mt-2 text-sm text-muted-foreground">输入旧面板地址和管理员账户，自动导入数据并同步 Agent。</p>
              </button>
            </div>

            {mode === "new" && (
              <div className="grid gap-4 rounded-lg border bg-white/70 p-4">
                {hasAdmin ? (
                  <Alert>
                    <ShieldCheck className="h-4 w-4" />
                    <AlertTitle>已检测到管理员账户</AlertTitle>
                    <AlertDescription>可以直接前往登录页使用数据库中的管理员账户。</AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>管理员邮箱</Label>
                        <Input type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} placeholder="admin@example.com" />
                      </div>
                      <div className="space-y-2">
                        <Label>显示名称</Label>
                        <Input value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} placeholder="管理员" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>密码</Label>
                      <Input type="password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} placeholder="至少 8 位" />
                    </div>
                    <Button disabled={createAdmin.isPending} onClick={() => createAdmin.mutate(admin)} className="w-full sm:w-fit">
                      {createAdmin.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      创建管理员账户
                    </Button>
                  </>
                )}
              </div>
            )}

            {mode === "migrate" && (
              <div className="grid gap-4 rounded-lg border bg-white/70 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>旧面板地址</Label>
                    <Input value={migration.oldPanelUrl} onChange={(e) => setMigration({ ...migration, oldPanelUrl: e.target.value })} placeholder="http://旧IP:3000 或 https://panel.example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>新面板访问地址</Label>
                    <Input value={migration.targetPanelUrl} onChange={(e) => setMigration({ ...migration, targetPanelUrl: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>旧面板管理员账户</Label>
                    <Input value={migration.username} onChange={(e) => setMigration({ ...migration, username: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>旧面板管理员密码</Label>
                    <Input type="password" value={migration.password} onChange={(e) => setMigration({ ...migration, password: e.target.value })} />
                  </div>
                </div>
                <Button disabled={startMigration.isPending || !!jobId} onClick={() => startMigration.mutate(migration)} className="w-full sm:w-fit">
                  {startMigration.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MoveRight className="mr-2 h-4 w-4" />}
                  开始迁移
                </Button>
                {migrationStatus.data && (
                  <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{migrationStatus.data.step}</span>
                      <span>{migrationStatus.data.progress}%</span>
                    </div>
                    <Progress value={migrationStatus.data.progress} className="mt-3" />
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      {migrationStatus.data.status === "running" && <RotateCcw className="h-3.5 w-3.5 animate-spin" />}
                      {migrationStatus.data.status === "success" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                      {migrationStatus.data.error || "迁移过程中请保持新旧面板可访问。"}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {dbReady && hasAdmin && mode !== "migrate" && (
          <div className="flex justify-center">
            <Button onClick={() => { window.location.href = "/login"; }}>
              前往登录
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
