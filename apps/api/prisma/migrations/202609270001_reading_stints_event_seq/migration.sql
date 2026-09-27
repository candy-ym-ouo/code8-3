-- AlterTable
ALTER TABLE "activity_events" ADD COLUMN     "seq" BIGSERIAL NOT NULL;

-- CreateTable
CREATE TABLE "reading_stints" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "stint_round" INTEGER NOT NULL,
    "note" VARCHAR(2000),
    "pause_reason" VARCHAR(500),
    "end_status" "BookStatus",
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "reading_stints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reading_stints_user_id_deleted_at_started_at_idx" ON "reading_stints"("user_id", "deleted_at", "started_at");

-- CreateIndex
CREATE INDEX "reading_stints_book_id_stint_round_deleted_at_idx" ON "reading_stints"("book_id", "stint_round", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "activity_events_seq_key" ON "activity_events"("seq");

-- AddForeignKey
ALTER TABLE "reading_stints" ADD CONSTRAINT "reading_stints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_stints" ADD CONSTRAINT "reading_stints_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A book can only have one reading stint open at a time.
CREATE UNIQUE INDEX "reading_stints_one_open_per_book_key"
  ON "reading_stints"("book_id")
  WHERE "ended_at" IS NULL AND "deleted_at" IS NULL;
