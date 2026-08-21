CREATE TABLE "quote_requests" (
	"id" serial PRIMARY KEY,
	"ref" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"part_no" text DEFAULT '' NOT NULL,
	"vehicle_id" text DEFAULT '' NOT NULL,
	"destination_country" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" serial PRIMARY KEY,
	"request_id" integer NOT NULL UNIQUE,
	"part_name" text DEFAULT '' NOT NULL,
	"part_no" text DEFAULT '' NOT NULL,
	"vin" text DEFAULT '' NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"image_key" text,
	"image_type" text,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"part_cost" numeric(12,2) DEFAULT '0' NOT NULL,
	"shipping_cost" numeric(12,2) DEFAULT '0' NOT NULL,
	"duties_cost" numeric(12,2) DEFAULT '0' NOT NULL,
	"total_cost" numeric(12,2) DEFAULT '0' NOT NULL,
	"lead_time" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_request_id_quote_requests_id_fkey" FOREIGN KEY ("request_id") REFERENCES "quote_requests"("id");