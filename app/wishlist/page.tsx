import { connection } from "next/server";

import { WishlistView } from "@/components/wishlist-view";

export const metadata = {
  title: "我的心愿单",
  description: "按主题分组管理收藏的房源。",
};

export default async function WishlistPage() {
  await connection();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <WishlistView />
    </div>
  );
}
