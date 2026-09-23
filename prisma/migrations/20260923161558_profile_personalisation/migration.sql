-- AlterTable
ALTER TABLE "User" ADD COLUMN     "coverImage" TEXT,
ADD COLUMN     "coverPreset" TEXT,
ADD COLUMN     "dreamDestinations" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "hobbies" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "visitedPlaces" TEXT[] DEFAULT ARRAY[]::TEXT[];
