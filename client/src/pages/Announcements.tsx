import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const emptyForm = {
  id: 0,
  title: "",
  content: "",
  type: "normal" as "normal" | "popup",
  isActive: true,
  startsAt: "",
  expiresAt: "",
};

function toInputDate(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateText(value?: string | Date | null) {
  return value ? new Date(value).toLocaleString() : "不限";
}

export default function Announcements() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const { data: announcements = [] } = trpc.announcements.list.useQuery();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const createAnnouncement = trpc.announcements.create.useMutation({
    onSuccess: () => {
      toast.success("公告已创建");
      setOpen(false);
      setForm(emptyForm);
      utils.announcements.list.invalidate();
      utils.announcements.popup.invalidate();
    },
    onError: (error) => toast.error(error.message || "创建失败"),
  });

  const updateAnnouncement = trpc.announcements.update.useMutation({
    onSuccess: () => {
      toast.success("公告已更新");
      setOpen(false);
      setForm(emptyForm);
      utils.announcements.list.invalidate();
      utils.announcements.popup.invalidate();
    },
    onError: (error) => toast.error(error.message || "更新失败"),
  });

  const deleteAnnouncement = trpc.announcements.delete.useMutation({
    onSuccess: () => {
      toast.success("公告已删除");
      utils.announcements.list.invalidate();
      utils.announcements.popup.invalidate();
    },
    onError: (error) => toast.error(error.message || "删除失败"),
  });

  const submit = () => {
    const payload = {
      title: form.title,
      content: form.content,
      type: form.type,
      isActive: form.isActive,
      startsAt: form.startsAt || null,
      expiresAt: form.expiresAt || null,
    };
    if (form.id) updateAnnouncement.mutate({ ...payload, id: form.id });
    else createAnnouncement.mutate(payload);
  };

  const edit = (item: any) => {
    setForm({
      id: item.id,
      title: item.title || "",
      content: item.content || "",
      type: item.type === "popup" ? "popup" : "normal",
      isActive: !!item.isActive,
      startsAt: toInputDate(item.startsAt),
      expiresAt: toInputDate(item.expiresAt),
    });
    setOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{isAdmin ? "公告管理" : "公告"}</h1>
            <p className="text-sm text-muted-foreground">{isAdmin ? "管理登录弹窗公告和普通公告。" : "查看管理员发布的公告信息。"}</p>
          </div>
          {isAdmin && (
            <Button onClick={() => { setForm(emptyForm); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> 新增公告
            </Button>
          )}
        </div>

        <div className="grid gap-4">
          {announcements.map((item: any) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Megaphone className="h-5 w-5" />
                      {item.title}
                      <Badge variant={item.type === "popup" ? "default" : "outline"}>{item.type === "popup" ? "登录弹窗" : "普通公告"}</Badge>
                      {isAdmin && <Badge variant={item.isActive ? "outline" : "secondary"}>{item.isActive ? "启用" : "停用"}</Badge>}
                    </CardTitle>
                    <CardDescription className="mt-2">有效期：{dateText(item.startsAt)} - {dateText(item.expiresAt)}</CardDescription>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="icon" onClick={() => edit(item)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteAnnouncement.mutate({ id: item.id })}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">{item.content}</div>
              </CardContent>
            </Card>
          ))}
          {announcements.length === 0 && (
            <Card>
              <CardHeader><CardTitle>暂无公告</CardTitle><CardDescription>当前没有可查看的公告。</CardDescription></CardHeader>
            </Card>
          )}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{form.id ? "编辑公告" : "新增公告"}</DialogTitle>
              <DialogDescription>登录弹窗公告同一时间只能启用一条，普通公告会在公告页面展示。</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>标题</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="space-y-2"><Label>类型</Label><Select value={form.type} onValueChange={(type: "normal" | "popup") => setForm({ ...form, type })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">普通公告</SelectItem><SelectItem value="popup">登录弹窗</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label>生效时间</Label><Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></div>
                <div className="space-y-2"><Label>失效时间</Label><Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>内容</Label><Textarea className="min-h-40" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.isActive} onCheckedChange={(isActive) => setForm({ ...form, isActive })} /> 启用公告</label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
              <Button onClick={submit} disabled={!form.title.trim() || !form.content.trim() || createAnnouncement.isPending || updateAnnouncement.isPending}>保存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
