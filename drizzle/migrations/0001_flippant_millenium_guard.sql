CREATE TABLE "cron_sync_state" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'cron-job.org' NOT NULL,
	"job_id" integer,
	"fingerprint" text,
	"schedule_json" text,
	"last_synced_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"last_error" text
);
