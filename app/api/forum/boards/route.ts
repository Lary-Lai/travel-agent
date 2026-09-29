import { handler, ok } from "@/lib/http";
import { listBoards } from "@/server/forum.service";

/**
 * GET /api/forum/boards — every board, ordered by position.
 *
 * Public: the board rail is the entry point to the forum, so it renders for
 * signed-out visitors too. Each board carries its post count and latest activity
 * so the rail can sort and label itself without a request per board.
 */
export const GET = handler(async () => {
  const boards = await listBoards();
  return ok({ boards });
});
