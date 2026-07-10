import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { seedDefaultCategories } from "@/lib/auth";

// Clerk user lifecycle sync. Verified with svix using CLERK_WEBHOOK_SECRET.
type ClerkEmail = { id: string; email_address: string };
type ClerkUserData = {
  id: string;
  email_addresses: ClerkEmail[];
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
};
type ClerkEvent =
  | { type: "user.created" | "user.updated"; data: ClerkUserData }
  | { type: "user.deleted"; data: { id: string } };

function primaryEmail(data: ClerkUserData): string {
  const primary = data.email_addresses.find(
    (e) => e.id === data.primary_email_address_id
  );
  return (
    primary?.email_address ??
    data.email_addresses[0]?.email_address ??
    `${data.id}@placeholder.local`
  );
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { code: "server_error", message: "Webhook not configured." } },
      { status: 500 }
    );
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Missing svix headers." } },
      { status: 400 }
    );
  }

  const payload = await req.text();
  let event: ClerkEvent;
  try {
    event = new Webhook(secret).verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkEvent;
  } catch {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Invalid signature." } },
      { status: 400 }
    );
  }

  if (event.type === "user.created" || event.type === "user.updated") {
    const data = event.data;
    const email = primaryEmail(data);
    const displayName =
      [data.first_name, data.last_name].filter(Boolean).join(" ") || null;

    await db
      .insert(users)
      .values({ id: data.id, email, displayName })
      .onConflictDoUpdate({
        target: users.id,
        set: { email, displayName },
      });

    if (event.type === "user.created") {
      await seedDefaultCategories(data.id);
    }
  } else if (event.type === "user.deleted") {
    // Cascades remove categories, blocks, exceptions, subscriptions.
    await db.delete(users).where(eq(users.id, event.data.id));
  }

  return NextResponse.json({ received: true });
}
