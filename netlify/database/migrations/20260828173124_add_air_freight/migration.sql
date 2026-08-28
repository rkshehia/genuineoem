ALTER TABLE "quotes" ADD COLUMN "air_freight_cost" numeric(12,2);--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "freight_method" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "payment_ref" text;