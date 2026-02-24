-- CreateTable
CREATE TABLE "request_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "user_id" TEXT,
    "ip" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "error" TEXT,
    "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CreateIndex
CREATE INDEX "idx_request_logs_created" ON "request_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_request_logs_user" ON "request_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_request_logs_status" ON "request_logs"("status_code");
