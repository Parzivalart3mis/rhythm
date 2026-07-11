import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="app-shell flex min-h-svh flex-col items-center justify-center gap-8 px-6 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-foreground">Rhythm</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build a schedule that&apos;s easier to follow.
        </p>
      </div>
      <SignUp />
    </main>
  );
}
