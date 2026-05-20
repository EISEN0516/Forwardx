import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Bold, Italic, Megaphone, Palette, Pencil, Plus, Trash2, Underline } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const emptyForm = {
  id: 0,
  title: "",
  content: "",
  type: "normal" as "normal" | "popup",
};

function dateText(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function renderAnnouncementHtml(content: string) {
  return { __html: content };
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
      title: form.title.trim(),
      content: form.content.trim(),
      type: form.type,
    };
    if (form.id) updateAnnouncement.mutate({ ...payload, id: form.id });
    else createAnnouncement.mutate(payload);
  };

  const insertContent = (before: string, after = "") => {
    const textarea = document.getElementById("announcement-content") as HTMLTextAreaElement | null;
    const start = textarea?.selectionStart ?? form.content.length;
    const end = textarea?.selectionEnd ?? form.content.length;
    const selected = form.content.slice(start, end);
    const next = `${form.content.slice(0, start)}${before}${selected}${after}${form.content.slice(end)}`;
    setForm({ ...form, content: next });
    requestAnimationFrame(() => {
      textarea?.focus();
      const cursor = start + before.length + selected.length;
      textarea?.setSelectionRange(cursor, cursor);
    });
  };

  const edit = (item: any) => {
    setForm({
      id: item.id,
      title: item.title || "",
      content: item.content || "",
      type: item.type === "popup" ? "popup" : "normal",
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
          {announcements.map((item: any) => {
            const isPopup = item.type === "popup";
            return (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="flex flex-wrap items-center gap-2">
                        <Megaphone className="h-5 w-5" />
                        {item.title}
                        <Badge variant={isPopup ? "default" : "outline"}>{isPopup ? "登录弹窗" : "普通公告"}</Badge>
                      </CardTitle>
                      {!isPopup && (
                        <CardDescription className="mt-2">发布时间：{dateText(item.createdAt || item.updatedAt)}</CardDescription>
                      )}
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
                  <div className="whitespace-pre-wrap text-sm leading-6 text-foreground/85" dangerouslySetInnerHTML={renderAnnouncementHtml(item.content || "")} />
                </CardContent>
              </Card>
            );
          })}
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
              <DialogDescription>登录弹窗公告会在用户登录后弹出，普通公告会在公告页面展示。</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>标题</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="space-y-2"><Label>类型</Label><Select value={form.type} onValueChange={(type: "normal" | "popup") => setForm({ ...form, type })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">普通公告</SelectItem><SelectItem value="popup">登录弹窗</SelectItem></SelectContent></Select></div>
              </div>
              <div className="space-y-2">
                <Label>内容</Label>
                <div className="flex flex-wrap gap-2 rounded-md border border-border/50 bg-muted/20 p-2">
                  <Button type="button" variant="ghost" size="icon" title="加粗" onClick={() => insertContent("**", "**")}><Bold className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" title="斜体" onClick={() => insertContent("*", "*")}><Italic className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" title="下划线" onClick={() => insertContent("<u>", "</u>")}><Underline className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" title="红色文字" onClick={() => insertContent('<span style="color:#ef4444">', "</span>")}><Palette className="h-4 w-4 text-red-500" /></Button>
                  <Button type="button" variant="ghost" size="icon" title="绿色文字" onClick={() => insertContent('<span style="color:#22c55e">', "</span>")}><Palette className="h-4 w-4 text-emerald-500" /></Button>
                  <Button type="button" variant="ghost" size="icon" title="蓝色文字" onClick={() => insertContent('<span style="color:#3b82f6">', "</span>")}><Palette className="h-4 w-4 text-blue-500" /></Button>
                </div>
                <Textarea id="announcement-content" className="min-h-40" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              </div>
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
