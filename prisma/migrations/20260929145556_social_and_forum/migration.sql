-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'FRIENDS', 'SELECTED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ProfileAccessKind" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "profileVisibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC';

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileAccess" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "kind" "ProfileAccessKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "nameI18n" JSONB,
    "descriptionI18n" JSONB,
    "icon" TEXT,
    "emoji" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "city" TEXT,
    "image" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reply" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");

-- CreateIndex
CREATE INDEX "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");

-- CreateIndex
CREATE INDEX "ProfileAccess_ownerId_kind_idx" ON "ProfileAccess"("ownerId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileAccess_ownerId_viewerId_key" ON "ProfileAccess"("ownerId", "viewerId");

-- CreateIndex
CREATE UNIQUE INDEX "Board_slug_key" ON "Board"("slug");

-- CreateIndex
CREATE INDEX "Board_position_idx" ON "Board"("position");

-- CreateIndex
CREATE INDEX "Post_boardId_pinned_createdAt_idx" ON "Post"("boardId", "pinned", "createdAt");

-- CreateIndex
CREATE INDEX "Post_authorId_idx" ON "Post"("authorId");

-- CreateIndex
CREATE INDEX "Post_city_idx" ON "Post"("city");

-- CreateIndex
CREATE INDEX "Reply_postId_createdAt_idx" ON "Reply"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "Reply_authorId_idx" ON "Reply"("authorId");

-- CreateIndex
CREATE INDEX "User_profileVisibility_idx" ON "User"("profileVisibility");

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileAccess" ADD CONSTRAINT "ProfileAccess_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileAccess" ADD CONSTRAINT "ProfileAccess_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
