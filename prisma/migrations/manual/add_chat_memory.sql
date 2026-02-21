-- Memory System Tables Migration
-- Run this manually when database is available:
-- npx prisma migrate dev --name add_chat_memory
-- Or apply this SQL directly to the database

-- ChatSession table
CREATE TABLE IF NOT EXISTS "ChatSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "speakerId" TEXT,
    "topicId" TEXT,
    "sessionType" TEXT NOT NULL DEFAULT 'practice',
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "contextSummary" JSONB,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "extractedData" JSONB,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- ChatMessage table
CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'text',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "ChatSession_accountId_status_idx" ON "ChatSession"("accountId", "status");
CREATE INDEX IF NOT EXISTS "ChatSession_accountId_startedAt_idx" ON "ChatSession"("accountId", "startedAt");
CREATE INDEX IF NOT EXISTS "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- Foreign keys
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_speakerId_fkey" 
    FOREIGN KEY ("speakerId") REFERENCES "Speaker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_topicId_fkey" 
    FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" 
    FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
