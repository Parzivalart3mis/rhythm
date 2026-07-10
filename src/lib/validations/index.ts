import { z } from "zod";

const HEX = /^#[0-9A-Fa-f]{6}$/;
const HHMM = /^\d{2}:\d{2}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const categoryInput = z.object({
  name: z.string().min(1).max(50),
  colorHex: z.string().regex(HEX, "Must be a #RRGGBB hex color"),
});
export type CategoryInput = z.infer<typeof categoryInput>;

export const categoryUpdate = z.object({
  name: z.string().min(1).max(50).optional(),
  colorHex: z.string().regex(HEX, "Must be a #RRGGBB hex color").optional(),
});

const timeStr = z.string().regex(HHMM, "Must be HH:MM");
const dateStr = z.string().regex(YMD, "Must be YYYY-MM-DD");

export const blockInput = z
  .object({
    categoryId: z.string().uuid(),
    title: z.string().min(1).max(100),
    notes: z.string().max(500).optional(),
    blockType: z.enum(["fixed_time", "flexible_task"]),
    startTime: timeStr.optional(),
    endTime: timeStr.optional(),
    taskDate: dateStr.optional(),
    isRecurring: z.boolean(),
    rruleString: z.string().max(500).optional(),
    seriesStartDate: dateStr.optional(),
    reminderLeadMinutes: z.number().int().min(0).max(1440).default(10),
    // When true, the client acknowledges a conflict warning and wants to save anyway.
    force: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.blockType === "fixed_time") {
      if (!v.startTime || !v.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Fixed-time blocks need a start and end time.",
          path: ["startTime"],
        });
      } else if (v.startTime >= v.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "End time must be after start time.",
          path: ["endTime"],
        });
      }
    }
    if (v.isRecurring) {
      if (!v.rruleString) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Recurring blocks need a recurrence rule.",
          path: ["rruleString"],
        });
      }
      if (!v.seriesStartDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Recurring blocks need a start date.",
          path: ["seriesStartDate"],
        });
      }
    } else if (!v.taskDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Non-recurring blocks need a date.",
        path: ["taskDate"],
      });
    }
  });
export type BlockInput = z.infer<typeof blockInput>;

export const occurrenceEdit = z
  .object({
    occurrenceDate: dateStr,
    exceptionType: z.enum(["skip", "reschedule"]),
    newStartTime: timeStr.optional(),
    newEndTime: timeStr.optional(),
    newDate: dateStr.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.exceptionType === "reschedule") {
      if (v.newStartTime && v.newEndTime && v.newStartTime >= v.newEndTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "End time must be after start time.",
          path: ["newEndTime"],
        });
      }
    }
  });
export type OccurrenceEdit = z.infer<typeof occurrenceEdit>;

export const checkConflictsInput = z.object({
  date: dateStr,
  startTime: timeStr,
  endTime: timeStr,
  excludeBlockId: z.string().uuid().optional(),
});
export type CheckConflictsInput = z.infer<typeof checkConflictsInput>;

export const pushSubscribeInput = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeInput>;

export const viewQuery = z.object({
  view: z.enum(["day", "week", "month"]),
  date: z.string().regex(YMD, "Must be YYYY-MM-DD"),
});
