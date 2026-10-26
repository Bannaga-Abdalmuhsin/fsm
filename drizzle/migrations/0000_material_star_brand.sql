CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"work_order_id" text,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"event_type" text NOT NULL,
	"actor_email" text NOT NULL,
	"message" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"accuracy_meters" double precision,
	"distance_meters" double precision,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"work_order_id" text NOT NULL,
	"etl_code" text NOT NULL,
	"title" text NOT NULL,
	"evidence_group" text NOT NULL,
	"expected_equipment" text NOT NULL,
	"required_details" text NOT NULL,
	"is_housekeeping" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"work_order_id" text NOT NULL,
	"task_id" text NOT NULL,
	"technician_email" text NOT NULL,
	"source" text NOT NULL,
	"gallery_approval_id" text,
	"image_sha256" text NOT NULL,
	"average_hash" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sharpness" double precision NOT NULL,
	"sky_fraction" double precision NOT NULL,
	"mean_luma" double precision NOT NULL,
	"daylight_signal" text NOT NULL,
	"device_captured_at" text NOT NULL,
	"device_timezone" text NOT NULL,
	"gps_time" text,
	"client_sent_at" text NOT NULL,
	"uploaded_at" text NOT NULL,
	"server_offset_ms" integer NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy_meters" double precision NOT NULL,
	"distance_meters" double precision NOT NULL,
	"location_timestamp" text NOT NULL,
	"sun_altitude_degrees" double precision NOT NULL,
	"vision_status" text NOT NULL,
	"decision" text NOT NULL,
	"decision_basis" text NOT NULL,
	"decision_note" text,
	"decided_by" text,
	"decided_at" text
);
--> statement-breakpoint
CREATE TABLE "evidence_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"evidence_id" text NOT NULL,
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"severity" text NOT NULL,
	"resolvable" boolean NOT NULL,
	"message" text NOT NULL,
	"status" text NOT NULL,
	"resolution_note" text,
	"resolved_by" text,
	"resolved_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"work_order_id" text NOT NULL,
	"technician_email" text NOT NULL,
	"evidence_groups" text NOT NULL,
	"reason" text NOT NULL,
	"max_images" integer NOT NULL,
	"images_used" integer DEFAULT 0 NOT NULL,
	"expires_at" text NOT NULL,
	"approved_by_email" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"email" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"site_name" text NOT NULL,
	"site_latitude" double precision NOT NULL,
	"site_longitude" double precision NOT NULL,
	"tcn_start" text NOT NULL,
	"tcn_end" text NOT NULL,
	"technician_email" text,
	"status" text DEFAULT 'assigned' NOT NULL,
	"checked_in_at" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "work_orders" ("id", "reference", "site_name", "site_latitude", "site_longitude", "tcn_start", "tcn_end", "technician_email", "status", "checked_in_at", "created_at") VALUES
('wo-1001', 'PMR-RYD-1001', 'Sample site RYD-014', 24.7743, 46.7386, '2026-09-30T21:00:00.000Z', '2026-12-31T20:59:00.000Z', NULL, 'assigned', NULL, '2026-10-26T06:00:00.000Z'),
('wo-1002', 'PMR-RYD-1002', 'Sample site RYD-022', 24.7136, 46.6753, '2026-09-30T21:00:00.000Z', '2026-12-31T20:59:00.000Z', NULL, 'assigned', NULL, '2026-10-26T06:05:00.000Z'),
('wo-1003', 'PMR-JED-1003', 'Sample site JED-007', 21.4858, 39.1925, '2026-09-30T21:00:00.000Z', '2026-12-31T20:59:00.000Z', NULL, 'assigned', NULL, '2026-10-26T06:10:00.000Z');
--> statement-breakpoint
INSERT INTO "capture_tasks" ("id", "work_order_id", "etl_code", "title", "evidence_group", "expected_equipment", "required_details", "is_housekeeping", "sort_order") VALUES
('task-1001-01', 'wo-1001', 'ETL-RECT-01', 'Rectifier cabinet', 'Rectifier', 'Rectifier cabinet with modules and controller visible', 'Cabinet, modules and controller', false, 1),
('task-1001-02', 'wo-1001', 'ETL-RECT-02', 'Rectifier display readings', 'Rectifier', 'Rectifier controller display', 'Readable close-up of the display', false, 2),
('task-1001-03', 'wo-1001', 'ETL-BATT-01', 'Battery bank', 'Batteries', 'Battery bank with terminals visible', 'Terminals and rack', false, 3),
('task-1001-04', 'wo-1001', 'ETL-MDB-01', 'MDB internal wiring', 'MDB', 'MDB internals with door open', 'Internal wiring and breakers visible', false, 4),
('task-1001-05', 'wo-1001', 'ETL-AC-01', 'AC1 equipment label', 'AC', 'AC1 unit with equipment label', 'Equipment label readable', false, 5),
('task-1001-06', 'wo-1001', 'ETL-HK-01', 'Site housekeeping', 'Housekeeping', 'Cabinet area and floor around cabinets', 'Litter, oil, vegetation and cable arrangement', true, 6),
('task-1002-01', 'wo-1002', 'ETL-RECT-03', 'Rectifier cabinet', 'Rectifier', 'Rectifier cabinet with modules and controller visible', 'Cabinet, modules and controller', false, 1),
('task-1002-02', 'wo-1002', 'ETL-HK-02', 'Site housekeeping', 'Housekeeping', 'Cabinet area and ventilation openings', 'Litter, obstruction and ventilation', true, 2),
('task-1003-01', 'wo-1003', 'ETL-BATT-02', 'Battery bank', 'Batteries', 'Battery bank with terminals visible', 'Terminals and rack', false, 1),
('task-1003-02', 'wo-1003', 'ETL-AC-02', 'AC2 equipment label', 'AC', 'AC2 unit with equipment label', 'Equipment label readable', false, 2);
