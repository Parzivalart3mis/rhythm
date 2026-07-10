import {
  pgTable,
  text,
  uuid,
  boolean,
  timestamp,
  time,
  date,
  integer,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const blockTypeEnum = pgEnum("block_type", ["fixed_time", "flexible_task"]);
export const exceptionTypeEnum = pgEnum("exception_type", ["skip", "reschedule"]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["sent", "failed"]);

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user ID
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    colorHex: text("color_hex").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("categories_user_id_idx").on(t.userId)]
);

export const scheduleBlocks = pgTable(
  "schedule_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    notes: text("notes"),
    blockType: blockTypeEnum("block_type").notNull(),
    startTime: time("start_time"), // null for flexible tasks
    endTime: time("end_time"), // null for flexible tasks
    taskDate: date("task_date"), // one-off flexible tasks without recurrence
    isRecurring: boolean("is_recurring").notNull().default(false),
    rruleString: text("rrule_string"), // RFC 5545, e.g. FREQ=WEEKLY;BYDAY=MO,WE,FR
    seriesStartDate: date("series_start_date"), // recurrence anchor
    reminderLeadMinutes: integer("reminder_lead_minutes").notNull().default(10),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("schedule_blocks_user_id_idx").on(t.userId),
    index("schedule_blocks_user_recurring_idx").on(t.userId, t.isRecurring),
  ]
);

export const blockExceptions = pgTable(
  "block_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleBlockId: uuid("schedule_block_id")
      .notNull()
      .references(() => scheduleBlocks.id, { onDelete: "cascade" }),
    occurrenceDate: date("occurrence_date").notNull(), // the original date being modified
    exceptionType: exceptionTypeEnum("exception_type").notNull(),
    newStartTime: time("new_start_time"), // reschedule only
    newEndTime: time("new_end_time"), // reschedule only
    newDate: date("new_date"), // reschedule only, if moved to a different day
  },
  (t) => [
    uniqueIndex("block_exceptions_block_date_uq").on(
      t.scheduleBlockId,
      t.occurrenceDate
    ),
  ]
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dhKey: text("p256dh_key").notNull(),
    authKey: text("auth_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_user_id_idx").on(t.userId)]
);

export const reminderDeliveries = pgTable(
  "reminder_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleBlockId: uuid("schedule_block_id")
      .notNull()
      .references(() => scheduleBlocks.id, { onDelete: "cascade" }),
    occurrenceDate: date("occurrence_date").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    status: deliveryStatusEnum("status").notNull(),
  },
  (t) => [
    uniqueIndex("reminder_deliveries_block_date_uq").on(
      t.scheduleBlockId,
      t.occurrenceDate
    ),
  ]
);

// ---- Relations ----
export const usersRelations = relations(users, ({ many }) => ({
  categories: many(categories),
  scheduleBlocks: many(scheduleBlocks),
  pushSubscriptions: many(pushSubscriptions),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  scheduleBlocks: many(scheduleBlocks),
}));

export const scheduleBlocksRelations = relations(scheduleBlocks, ({ one, many }) => ({
  user: one(users, { fields: [scheduleBlocks.userId], references: [users.id] }),
  category: one(categories, {
    fields: [scheduleBlocks.categoryId],
    references: [categories.id],
  }),
  exceptions: many(blockExceptions),
}));

export const blockExceptionsRelations = relations(blockExceptions, ({ one }) => ({
  block: one(scheduleBlocks, {
    fields: [blockExceptions.scheduleBlockId],
    references: [scheduleBlocks.id],
  }),
}));

// ---- Inferred types ----
export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type ScheduleBlock = typeof scheduleBlocks.$inferSelect;
export type BlockException = typeof blockExceptions.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type ReminderDelivery = typeof reminderDeliveries.$inferSelect;
