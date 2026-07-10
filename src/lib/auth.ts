import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, categories } from "@/lib/db/schema";
import { DEFAULT_CATEGORIES } from "@/lib/constants";

/**
 * Ensure a users row exists for the current Clerk user, seeding default
 * categories on first sight. The Clerk webhook normally creates the row, but this
 * is an idempotent fallback so the app works before/without the webhook.
 */
export async function ensureUser(userId: string): Promise<void> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (existing.length > 0) return;

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    `${userId}@placeholder.local`;
  const displayName =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || null;

  await db
    .insert(users)
    .values({ id: userId, email, displayName })
    .onConflictDoNothing();

  await seedDefaultCategories(userId);
}

export async function seedDefaultCategories(userId: string): Promise<void> {
  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.userId, userId))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(categories).values(
    DEFAULT_CATEGORIES.map((c) => ({
      userId,
      name: c.name,
      colorHex: c.colorHex,
      isDefault: true,
    }))
  );
}

/**
 * Resolve the authenticated user id, creating the DB row if needed. Returns null
 * when unauthenticated so callers can respond with 401.
 */
export async function requireUser(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  await ensureUser(userId);
  return userId;
}
