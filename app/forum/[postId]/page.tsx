import { connection } from "next/server";

import { PostDetailView } from "@/components/post-detail-view";
import { getTranslator } from "@/lib/i18n/server";
import { getPost } from "@/server/forum.service";

type Props = { params: Promise<{ postId: string }> };

export async function generateMetadata({ params }: Props) {
  const { postId } = await params;
  try {
    const { post } = await getPost(postId, null);
    return {
      title: post.title,
      // The body is authored text; a short prefix is enough for a preview card.
      description: post.excerpt,
    };
  } catch {
    // A deleted or unknown post still needs a title — and this function runs
    // separately from the page, so it needs its own translator.
    const { t } = await getTranslator();
    return { title: t("forum.metaTitle") };
  }
}

export default async function PostPage({ params }: Props) {
  // Renders the request's own post, and the reply box depends on the session
  // cookie, so this is never a static shell.
  await connection();
  const { postId } = await params;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PostDetailView postId={postId} />
    </div>
  );
}
