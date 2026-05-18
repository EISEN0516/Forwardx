import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { CreditCard, Gift, Plus, RefreshCw, TicketPercent, Trash2, WalletCards } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function money(cents?: number, currency = "CNY") {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format((Number(cents) || 0) / 100);
}

function dateText(value?: string | Date | null) {
  return value ? new Date(value).toLocaleString() : "不限";
}

function discountStatus(code: any) {
  const now = Date.now();
  if (!code.isActive) return "停用";
  if (code.startsAt && new Date(code.startsAt).getTime() > now) return "等待生效";
  if (code.expiresAt && new Date(code.expiresAt).getTime() <= now) return "已过期";
  if (Number(code.maxUses || 0) > 0 && Number(code.usedCount || 0) >= Number(code.maxUses)) return "已用完";
  return "生效中";
}

export default function Billing() {
  const utils = trpc.useUtils();
  const { data: users = [] } = trpc.users.list.useQuery();
  const { data: plans = [] } = trpc.plans.list.useQuery();
  const { data: transactions = [] } = trpc.billing.listTransactions.useQuery({ limit: 100 });
  const { data: redemptionCodes = [] } = trpc.billing.listRedemptionCodes.useQuery();
  const { data: discountCodes = [] } = trpc.billing.listDiscountCodes.useQuery();
  const { data: featureStatus } = trpc.billing.featureStatus.useQuery();

  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeUserId, setRechargeUserId] = useState("");
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [rechargeNote, setRechargeNote] = useState("");

  const [redeemType, setRedeemType] = useState<"plan" | "balance">("plan");
  const [redeemPlanId, setRedeemPlanId] = useState("");
  const [redeemDuration, setRedeemDuration] = useState("30");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [redeemCount, setRedeemCount] = useState("1");
  const [redeemStartsAt, setRedeemStartsAt] = useState("");
  const [redeemExpiresAt, setRedeemExpiresAt] = useState("");

  const [discountCode, setDiscountCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [discountMaxUses, setDiscountMaxUses] = useState("0");
  const [discountPlanIds, setDiscountPlanIds] = useState<number[]>([]);
  const [discountStartsAt, setDiscountStartsAt] = useState("");
  const [discountExpiresAt, setDiscountExpiresAt] = useState("");

  const setFeatureStatus = trpc.billing.setFeatureStatus.useMutation({
    onSuccess: () => {
      toast.success("功能开关已更新");
      utils.billing.featureStatus.invalidate();
    },
    onError: (error) => toast.error(error.message || "更新失败"),
  });

  const adminRecharge = trpc.billing.adminRecharge.useMutation({
    onSuccess: () => {
      toast.success("余额已充值");
      setRechargeOpen(false);
      setRechargeUserId("");
      setRechargeAmount("");
      setRechargeNote("");
      utils.users.list.invalidate();
      utils.billing.listTransactions.invalidate();
    },
    onError: (error) => toast.error(error.message || "充值失败"),
  });

  const createRedemptionCodes = trpc.billing.createRedemptionCodes.useMutation({
    onSuccess: (res) => {
      toast.success(`已生成 ${res.codes.length} 个兑换码`);
      utils.billing.listRedemptionCodes.invalidate();
    },
    onError: (error) => toast.error(error.message || "生成失败"),
  });

  const deleteRedemptionCode = trpc.billing.deleteRedemptionCode.useMutation({
    onSuccess: () => {
      toast.success("兑换码已删除");
      utils.billing.listRedemptionCodes.invalidate();
    },
    onError: (error) => toast.error(error.message || "删除失败"),
  });

  const createDiscountCode = trpc.billing.createDiscountCode.useMutation({
    onSuccess: () => {
      toast.success("折扣码已创建");
      setDiscountCode("");
      setDiscountValue("");
      setDiscountMaxUses("0");
      setDiscountPlanIds([]);
      utils.billing.listDiscountCodes.invalidate();
    },
    onError: (error) => toast.error(error.message || "创建失败"),
  });

  const deleteDiscountCode = trpc.billing.deleteDiscountCode.useMutation({
    onSuccess: () => {
      toast.success("折扣码已删除");
      utils.billing.listDiscountCodes.invalidate();
    },
    onError: (error) => toast.error(error.message || "删除失败"),
  });

  const submitRecharge = () => {
    adminRecharge.mutate({
      userId: Number(rechargeUserId),
      amountCents: Math.round(Number(rechargeAmount || 0) * 100),
      description: rechargeNote || undefined,
    });
  };

  const submitRedemption = () => {
    createRedemptionCodes.mutate({
      type: redeemType,
      count: Math.max(1, Math.floor(Number(redeemCount || 1))),
      planId: redeemType === "plan" ? Number(redeemPlanId) : null,
      durationDays: redeemType === "plan" ? Number(redeemDuration) as 30 | 90 | 180 | 365 : null,
      amountCents: redeemType === "balance" ? Math.round(Number(redeemAmount || 0) * 100) : 0,
      startsAt: redeemStartsAt || null,
      expiresAt: redeemExpiresAt || null,
    });
  };

  const submitDiscount = () => {
    createDiscountCode.mutate({
      code: discountCode,
      discountType,
      discountValue: discountType === "percent" ? Math.floor(Number(discountValue || 0)) : Math.round(Number(discountValue || 0) * 100),
      maxUses: Math.max(0, Math.floor(Number(discountMaxUses || 0))),
      planIds: discountPlanIds,
      startsAt: discountStartsAt || null,
      expiresAt: discountExpiresAt || null,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">余额与兑换</h1>
            <p className="text-sm text-muted-foreground">管理用户余额、兑换码和套餐折扣码。</p>
          </div>
          <Button onClick={() => setRechargeOpen(true)}><Plus className="mr-2 h-4 w-4" /> 手动充值</Button>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Card><CardHeader className="pb-2"><CardDescription>用户余额总额</CardDescription><CardTitle>{money(users.reduce((s: number, u: any) => s + Number(u.balanceCents || 0), 0))}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>可用兑换码</CardDescription><CardTitle>{redemptionCodes.filter((c: any) => c.isActive && !c.usedAt).length}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>生效折扣码</CardDescription><CardTitle>{discountCodes.filter((c: any) => discountStatus(c) === "生效中").length}</CardTitle></CardHeader></Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>用户兑换入口</CardDescription>
              <CardTitle className="flex items-center justify-between text-base">
                {featureStatus?.redemptionEnabled ? "已开启" : "已关闭"}
                <Switch checked={featureStatus?.redemptionEnabled ?? true} onCheckedChange={(redemptionEnabled) => setFeatureStatus.mutate({ redemptionEnabled })} />
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>购买折扣入口</CardDescription>
              <CardTitle className="flex items-center justify-between text-base">
                {featureStatus?.discountEnabled ? "已开启" : "已关闭"}
                <Switch checked={featureStatus?.discountEnabled ?? true} onCheckedChange={(discountEnabled) => setFeatureStatus.mutate({ discountEnabled })} />
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="balance">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="balance">余额流水</TabsTrigger>
            <TabsTrigger value="redeem">兑换码</TabsTrigger>
            <TabsTrigger value="discount">折扣码</TabsTrigger>
          </TabsList>

          <TabsContent value="balance" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5" /> 余额流水</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>用户</TableHead><TableHead>类型</TableHead><TableHead>金额</TableHead><TableHead>余额</TableHead><TableHead>说明</TableHead><TableHead>时间</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {transactions.map((tx: any) => (
                      <TableRow key={tx.id}>
                        <TableCell>{tx.username || `#${tx.userId}`}</TableCell>
                        <TableCell><Badge variant="outline">{tx.type}</Badge></TableCell>
                        <TableCell className={Number(tx.amountCents) >= 0 ? "text-emerald-600" : "text-destructive"}>{money(tx.amountCents)}</TableCell>
                        <TableCell>{money(tx.balanceAfterCents)}</TableCell>
                        <TableCell>{tx.description || "-"}</TableCell>
                        <TableCell>{dateText(tx.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="redeem" className="mt-4 space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Gift className="h-5 w-5" /> 生成兑换码</CardTitle><CardDescription>兑换码只能使用一次，可设置生效时间和失效时间。</CardDescription></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2"><Label>类型</Label><Select value={redeemType} onValueChange={(v: "plan" | "balance") => setRedeemType(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="plan">套餐期限</SelectItem><SelectItem value="balance">余额</SelectItem></SelectContent></Select></div>
                {redeemType === "plan" ? (
                  <>
                    <div className="space-y-2"><Label>套餐</Label><Select value={redeemPlanId} onValueChange={setRedeemPlanId}><SelectTrigger><SelectValue placeholder="选择套餐" /></SelectTrigger><SelectContent>{plans.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-2"><Label>期限</Label><Select value={redeemDuration} onValueChange={setRedeemDuration}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">1 个月</SelectItem><SelectItem value="90">3 个月</SelectItem><SelectItem value="180">6 个月</SelectItem><SelectItem value="365">1 年</SelectItem></SelectContent></Select></div>
                  </>
                ) : (
                  <div className="space-y-2"><Label>余额金额</Label><Input type="number" min={0.01} step="0.01" value={redeemAmount} onChange={(e) => setRedeemAmount(e.target.value)} /></div>
                )}
                <div className="space-y-2"><Label>数量</Label><Input type="number" min={1} max={500} value={redeemCount} onChange={(e) => setRedeemCount(e.target.value)} /></div>
                <div className="space-y-2"><Label>生效时间</Label><Input type="datetime-local" value={redeemStartsAt} onChange={(e) => setRedeemStartsAt(e.target.value)} /></div>
                <div className="space-y-2"><Label>失效时间</Label><Input type="datetime-local" value={redeemExpiresAt} onChange={(e) => setRedeemExpiresAt(e.target.value)} /></div>
                <div className="flex items-end md:col-span-2"><Button onClick={submitRedemption} disabled={createRedemptionCodes.isPending}><Gift className="mr-2 h-4 w-4" /> 生成兑换码</Button></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>兑换码列表</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>兑换码</TableHead><TableHead>类型</TableHead><TableHead>内容</TableHead><TableHead>有效期</TableHead><TableHead>使用情况</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {redemptionCodes.map((code: any) => (
                      <TableRow key={code.id}>
                        <TableCell className="font-mono">{code.code}</TableCell>
                        <TableCell><Badge variant="outline">{code.type === "plan" ? "套餐" : "余额"}</Badge></TableCell>
                        <TableCell>{code.type === "plan" ? `${code.planName || `套餐 #${code.planId}`} / ${code.durationDays || 30} 天` : money(code.amountCents)}</TableCell>
                        <TableCell>{dateText(code.startsAt)} - {dateText(code.expiresAt)}</TableCell>
                        <TableCell>{code.usedAt ? `${code.usedByUsername || code.usedByUserId} 于 ${dateText(code.usedAt)}` : "未使用"}</TableCell>
                        <TableCell className="text-right"><Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteRedemptionCode.mutate({ id: code.id })}><Trash2 className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="discount" className="mt-4 space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><TicketPercent className="h-5 w-5" /> 新增折扣码</CardTitle><CardDescription>折扣码用于用户购买套餐时抵扣，可限制有效期、使用次数和适用套餐。</CardDescription></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2"><Label>折扣码</Label><Input value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase())} placeholder="SALE2026" /></div>
                <div className="space-y-2"><Label>类型</Label><Select value={discountType} onValueChange={(v: "percent" | "amount") => setDiscountType(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percent">百分比</SelectItem><SelectItem value="amount">固定金额</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label>{discountType === "percent" ? "折扣百分比" : "抵扣金额"}</Label><Input type="number" min={1} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} /></div>
                <div className="space-y-2"><Label>可用次数</Label><Input type="number" min={0} value={discountMaxUses} onChange={(e) => setDiscountMaxUses(e.target.value)} placeholder="0=不限" /></div>
                <div className="space-y-2"><Label>生效时间</Label><Input type="datetime-local" value={discountStartsAt} onChange={(e) => setDiscountStartsAt(e.target.value)} /></div>
                <div className="space-y-2"><Label>失效时间</Label><Input type="datetime-local" value={discountExpiresAt} onChange={(e) => setDiscountExpiresAt(e.target.value)} /></div>
                <div className="space-y-2 md:col-span-4">
                  <Label>适用套餐</Label>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <button type="button" onClick={() => setDiscountPlanIds([])} className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${discountPlanIds.length === 0 ? "border-primary bg-primary/10 text-primary" : "border-border/60 bg-background/60 hover:bg-muted/60"}`}>全部套餐</button>
                    {plans.map((plan: any) => {
                      const checked = discountPlanIds.includes(Number(plan.id));
                      return (
                        <button key={plan.id} type="button" onClick={() => setDiscountPlanIds((ids) => checked ? ids.filter((id) => id !== Number(plan.id)) : [...ids, Number(plan.id)])} className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${checked ? "border-primary bg-primary/10 text-primary" : "border-border/60 bg-background/60 hover:bg-muted/60"}`}>
                          {plan.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-end md:col-span-2"><Button onClick={submitDiscount} disabled={createDiscountCode.isPending}><TicketPercent className="mr-2 h-4 w-4" /> 创建折扣码</Button></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>折扣码列表</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>折扣码</TableHead><TableHead>优惠</TableHead><TableHead>适用套餐</TableHead><TableHead>状态</TableHead><TableHead>次数</TableHead><TableHead>有效期</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {discountCodes.map((code: any) => (
                      <TableRow key={code.id}>
                        <TableCell className="font-mono">{code.code}</TableCell>
                        <TableCell>{code.discountType === "percent" ? `${code.discountValue}%` : money(code.discountValue)}</TableCell>
                        <TableCell>{code.planIds?.length ? code.planIds.map((id: number) => plans.find((p: any) => Number(p.id) === Number(id))?.name || `#${id}`).join("、") : "全部套餐"}</TableCell>
                        <TableCell><Badge variant={discountStatus(code) === "生效中" ? "default" : "secondary"}>{discountStatus(code)}</Badge></TableCell>
                        <TableCell>{code.usedCount || 0} / {code.maxUses || "不限"}</TableCell>
                        <TableCell>{dateText(code.startsAt)} - {dateText(code.expiresAt)}</TableCell>
                        <TableCell className="text-right"><Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteDiscountCode.mutate({ id: code.id })}><Trash2 className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={rechargeOpen} onOpenChange={setRechargeOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>管理员手动充值</DialogTitle><DialogDescription>为指定用户增加余额，会写入余额流水。</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>用户</Label><Select value={rechargeUserId} onValueChange={setRechargeUserId}><SelectTrigger><SelectValue placeholder="选择用户" /></SelectTrigger><SelectContent>{users.filter((u: any) => u.role !== "admin").map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.username}（{money(u.balanceCents)}）</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>金额</Label><Input type="number" min={0.01} step="0.01" value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)} /></div>
              <div className="space-y-2"><Label>备注</Label><Input value={rechargeNote} onChange={(e) => setRechargeNote(e.target.value)} placeholder="可选" /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setRechargeOpen(false)}>取消</Button><Button onClick={submitRecharge} disabled={!rechargeUserId || !rechargeAmount || adminRecharge.isPending}>{adminRecharge.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />} 充值</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
