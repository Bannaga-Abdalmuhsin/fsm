CREATE TABLE "pmr_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"org_id" text,
	"order_id" text NOT NULL,
	"technician" text NOT NULL,
	"groups" jsonb NOT NULL,
	"reason" text NOT NULL,
	"expires_at" text NOT NULL,
	"max_images" integer NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"revoked_at" text
);
--> statement-breakpoint
CREATE TABLE "pmr_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"org_id" text,
	"order_id" text NOT NULL,
	"event" text NOT NULL,
	"detail" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmr_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"org_id" text,
	"order_id" text NOT NULL,
	"group_id" text NOT NULL,
	"instance" text NOT NULL,
	"source" text NOT NULL,
	"approval_id" text,
	"capture_id" text NOT NULL,
	"captured_at" text NOT NULL,
	"uploaded_at" text NOT NULL,
	"gps" jsonb NOT NULL,
	"sha" text NOT NULL,
	"perceptual_hash" text NOT NULL,
	"handle" jsonb NOT NULL,
	"mime" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"findings" jsonb NOT NULL,
	"quality" jsonb NOT NULL,
	"analysis" jsonb,
	"state" text NOT NULL,
	"linked_etls" jsonb NOT NULL,
	"review_note" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmr_members" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"org_id" text,
	"role" text NOT NULL,
	"regions" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmr_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"org_id" text,
	"site_id" text NOT NULL,
	"site_type" text NOT NULL,
	"region" text NOT NULL,
	"team" text NOT NULL,
	"assignee" text NOT NULL,
	"wo" text NOT NULL,
	"tcn" text NOT NULL,
	"month" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"scheduled_start" text NOT NULL,
	"scheduled_end" text NOT NULL,
	"tcn_start" text NOT NULL,
	"tcn_end" text NOT NULL,
	"status" text DEFAULT 'Assigned' NOT NULL,
	"checked_in_at" text,
	"check_in" jsonb,
	"inventory" jsonb NOT NULL,
	"checklist" jsonb NOT NULL,
	"policy" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"review_note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmr_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"org_id" text,
	"policy" jsonb NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmr_results" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"org_id" text,
	"order_id" text NOT NULL,
	"etl_code" text NOT NULL,
	"instance" text NOT NULL,
	"status" text NOT NULL,
	"remarks" text NOT NULL,
	"readings" text NOT NULL,
	"tt" text NOT NULL,
	"noc" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pmr_approvals" ADD CONSTRAINT "pmr_approvals_order_id_pmr_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pmr_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmr_evidence" ADD CONSTRAINT "pmr_evidence_order_id_pmr_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pmr_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmr_results" ADD CONSTRAINT "pmr_results_order_id_pmr_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pmr_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pmr_audit_order" ON "pmr_audit" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "pmr_evidence_order" ON "pmr_evidence" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "pmr_evidence_hash" ON "pmr_evidence" USING btree ("org_id","sha");--> statement-breakpoint
CREATE UNIQUE INDEX "pmr_capture_id" ON "pmr_evidence" USING btree ("owner_email","capture_id");--> statement-breakpoint
CREATE INDEX "pmr_orders_assignee" ON "pmr_orders" USING btree ("assignee","org_id");--> statement-breakpoint
CREATE INDEX "pmr_orders_region" ON "pmr_orders" USING btree ("org_id","region");--> statement-breakpoint
CREATE UNIQUE INDEX "pmr_orders_wo_unique" ON "pmr_orders" USING btree ("owner_email","wo");--> statement-breakpoint
CREATE UNIQUE INDEX "pmr_result_etl" ON "pmr_results" USING btree ("order_id","etl_code","instance");