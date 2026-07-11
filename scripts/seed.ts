// Local dev seed: creates a demo user with default categories and a sample
// weekly schedule so the three views have something to render.
//
// Usage: SEED_USER_ID=user_123 SEED_EMAIL=you@example.com pnpm seed
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { users, categories, scheduleBlocks } from "../src/lib/db/schema";
import { DEFAULT_CATEGORIES } from "../src/lib/constants";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

async function main() {
  const userId = process.env.SEED_USER_ID ?? "user_demo_local";
  const email = process.env.SEED_EMAIL ?? "demo@rhythm.local";

  console.log(`Seeding user ${userId}…`);

  await db
    .insert(users)
    .values({ id: userId, email, displayName: "Demo", timezone: "America/Chicago" })
    .onConflictDoUpdate({ target: users.id, set: { email } });

  // Categories (default set).
  const existingCats = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));
  let cats = existingCats;
  if (existingCats.length === 0) {
    cats = await db
      .insert(categories)
      .values(
        DEFAULT_CATEGORIES.map((c) => ({
          userId,
          name: c.name,
          colorHex: c.colorHex,
          isDefault: true,
        }))
      )
      .returning();
  }
  const byName = (n: string) => cats.find((c) => c.name === n)!.id;

  // Clear existing blocks for a clean re-seed.
  await db.delete(scheduleBlocks).where(eq(scheduleBlocks.userId, userId));

  const seriesStart = today();

  await db.insert(scheduleBlocks).values([
    {
      userId,
      categoryId: byName("Class"),
      title: "Software Engineering Lecture",
      blockType: "fixed_time",
      startTime: "09:00",
      endTime: "10:15",
      isRecurring: true,
      rruleString: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
      seriesStartDate: seriesStart,
      reminderLeadMinutes: 15,
    },
    {
      userId,
      categoryId: byName("Class"),
      title: "Databases Lab",
      blockType: "fixed_time",
      startTime: "13:00",
      endTime: "14:30",
      isRecurring: true,
      rruleString: "FREQ=WEEKLY;BYDAY=TU,TH",
      seriesStartDate: seriesStart,
      reminderLeadMinutes: 10,
    },
    {
      userId,
      categoryId: byName("Gym"),
      title: "Push Day",
      blockType: "fixed_time",
      startTime: "18:00",
      endTime: "18:45",
      isRecurring: true,
      rruleString: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
      seriesStartDate: seriesStart,
      reminderLeadMinutes: 10,
    },
    {
      userId,
      categoryId: byName("Work"),
      title: "Team Standup",
      blockType: "fixed_time",
      startTime: "10:30",
      endTime: "10:45",
      isRecurring: true,
      rruleString: "FREQ=DAILY",
      seriesStartDate: seriesStart,
      reminderLeadMinutes: 5,
    },
    {
      userId,
      categoryId: byName("Personal"),
      title: "Finish OpenMRS exercise",
      blockType: "flexible_task",
      isRecurring: false,
      taskDate: seriesStart,
      reminderLeadMinutes: 10,
    },
  ]);

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
