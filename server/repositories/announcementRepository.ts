import { and, desc, eq, sql } from "drizzle-orm";
import { announcementReads, announcements, InsertAnnouncement } from "../../drizzle/schema";
import { getDb, nowDate } from "../dbRuntime";

function activeWindowCondition(nowSec: number) {
  return and(
    eq(announcements.isActive, true),
    sql`(${announcements.startsAt} IS NULL OR ${announcements.startsAt} <= ${nowSec})`,
    sql`(${announcements.expiresAt} IS NULL OR ${announcements.expiresAt} > ${nowSec})`,
  );
}

async function deactivateOtherPopups(exceptId?: number) {
  const db = await getDb();
  if (!db) return;
  const where = exceptId
    ? and(eq(announcements.type, "popup"), sql`${announcements.id} != ${exceptId}`)
    : eq(announcements.type, "popup");
  await db.update(announcements).set({ isActive: false, updatedAt: nowDate() } as any).where(where);
}

export async function listAnnouncements(includeInactive = false) {
  const db = await getDb();
  if (!db) return [];
  const base = db.select().from(announcements);
  if (!includeInactive) {
    return base
      .where(activeWindowCondition(Math.floor(Date.now() / 1000)))
      .orderBy(desc(announcements.updatedAt), desc(announcements.createdAt));
  }
  return base.orderBy(desc(announcements.updatedAt), desc(announcements.createdAt));
}

export async function createAnnouncement(data: InsertAnnouncement) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.type === "popup" && data.isActive !== false) await deactivateOtherPopups();
  await db.insert(announcements).values(data);
  return listAnnouncements(true);
}

export async function updateAnnouncement(id: number, data: Partial<InsertAnnouncement>) {
  const db = await getDb();
  if (!db) return undefined;
  if (data.type === "popup" && data.isActive !== false) await deactivateOtherPopups(id);
  await db.update(announcements).set({ ...data, updatedAt: nowDate() } as any).where(eq(announcements.id, id));
  const rows = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
  return rows[0];
}

export async function deleteAnnouncement(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(announcementReads).where(eq(announcementReads.announcementId, id));
  await db.delete(announcements).where(eq(announcements.id, id));
}

export async function listUserAnnouncements() {
  return listAnnouncements(false);
}

export async function getUnreadPopupAnnouncement(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const nowSec = Math.floor(Date.now() / 1000);
  const popupRows = await db
    .select()
    .from(announcements)
    .where(and(eq(announcements.type, "popup"), activeWindowCondition(nowSec)))
    .orderBy(desc(announcements.updatedAt), desc(announcements.createdAt))
    .limit(1);
  const popup = popupRows[0];
  if (!popup) return undefined;
  const readRows = await db
    .select({ id: announcementReads.id })
    .from(announcementReads)
    .where(and(eq(announcementReads.announcementId, popup.id), eq(announcementReads.userId, userId)))
    .limit(1);
  return readRows[0] ? undefined : popup;
}

export async function dismissAnnouncement(userId: number, announcementId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(announcementReads)
    .values({ userId, announcementId, dismissedAt: nowDate() } as any)
    .onConflictDoUpdate({
      target: [announcementReads.announcementId, announcementReads.userId],
      set: { dismissedAt: nowDate() } as any,
    });
}
