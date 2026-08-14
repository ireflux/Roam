CREATE TABLE "saved_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"source_share_id" text NOT NULL,
	"trip_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "saved_trips_owner_source_uq" ON "saved_trips" USING btree ("owner_id","source_share_id");