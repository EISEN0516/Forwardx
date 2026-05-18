import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { appendPanelLog } from "../_core/panelLogger";
import * as db from "../db";

const dateInput = z.string().trim().optional().nullable();

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

const announcementInput = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(5000),
  type: z.enum(["normal", "popup"]).default("normal"),
  isActive: z.boolean().default(true),
  startsAt: dateInput,
  expiresAt: dateInput,
});

export const announcementsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === "admin") return db.listAnnouncements(true);
    return db.listUserAnnouncements();
  }),

  popup: protectedProcedure.query(async ({ ctx }) => {
    return db.getUnreadPopupAnnouncement(ctx.user.id);
  }),

  dismiss: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await db.dismissAnnouncement(ctx.user.id, input.id);
      return { success: true };
    }),

  create: adminProcedure
    .input(announcementInput)
    .mutation(async ({ input, ctx }) => {
      const result = await db.createAnnouncement({
        title: input.title,
        content: input.content,
        type: input.type,
        isActive: input.isActive,
        startsAt: parseDate(input.startsAt),
        expiresAt: parseDate(input.expiresAt),
        createdByUserId: ctx.user.id,
      } as any);
      appendPanelLog("info", `[Announcement] created type=${input.type} user=${ctx.user.id}`);
      return result;
    }),

  update: adminProcedure
    .input(announcementInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const result = await db.updateAnnouncement(input.id, {
        title: input.title,
        content: input.content,
        type: input.type,
        isActive: input.isActive,
        startsAt: parseDate(input.startsAt),
        expiresAt: parseDate(input.expiresAt),
      } as any);
      appendPanelLog("info", `[Announcement] updated id=${input.id}`);
      return result;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db.deleteAnnouncement(input.id);
      appendPanelLog("info", `[Announcement] deleted id=${input.id}`);
      return { success: true };
    }),
});
