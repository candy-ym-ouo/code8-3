-- AlterEnum
ALTER TYPE "ActivityEntityType" ADD VALUE 'STAGE_NOTE';

-- AlterTable
ALTER TABLE "books" ADD COLUMN "pause_reason" VARCHAR(1000);

-- CreateTable
CREATE TABLE "stage_notes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reading_round" INTEGER NOT NULL,
    "stage" "BookStatus" NOT NULL,
    "note" VARCHAR(2000) NOT NULL,
    "pause_reason" VARCHAR(1000),
    "entered_at" TIMESTAMPTZ(3) NOT NULL,
    "left_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "stage_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stage_notes_user_id_deleted_at_entered_at_idx" ON "stage_notes"("user_id", "deleted_at", "entered_at");

-- CreateIndex
CREATE INDEX "stage_notes_book_id_reading_round_entered_at_idx" ON "stage_notes"("book_id", "reading_round", "entered_at");

-- CreateIndex
CREATE INDEX "stage_notes_book_id_stage_deleted_at_idx" ON "stage_notes"("book_id", "stage", "deleted_at");

-- AddForeignKey
ALTER TABLE "stage_notes" ADD CONSTRAINT "stage_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_notes" ADD CONSTRAINT "stage_notes_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A book keeps at most one active note per stage per reading round.
CREATE UNIQUE INDEX "stage_notes_book_round_stage_active_key"
  ON "stage_notes"("book_id", "reading_round", "stage")
  WHERE "deleted_at" IS NULL;

-- Monotonic per-event sequence: the total order of the timeline.
ALTER TABLE "activity_events" ADD COLUMN "seq" BIGSERIAL;

-- Recreate timeline indexes so ordering by (occurred_at, seq) is index-backed.
DROP INDEX "activity_events_user_id_occurred_at_idx";
DROP INDEX "activity_events_user_id_book_id_occurred_at_idx";
DROP INDEX "activity_events_user_id_entity_type_occurred_at_idx";

CREATE INDEX "activity_events_user_id_occurred_at_seq_idx" ON "activity_events"("user_id", "occurred_at", "seq");
CREATE INDEX "activity_events_user_id_book_id_occurred_at_seq_idx" ON "activity_events"("user_id", "book_id", "occurred_at", "seq");
CREATE INDEX "activity_events_user_id_entity_type_occurred_at_seq_idx" ON "activity_events"("user_id", "entity_type", "occurred_at", "seq");
