import { Compass, Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata = {
  title: "页面不存在",
};

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <div className="bg-muted text-muted-foreground mb-5 flex size-14 items-center justify-center rounded-full">
        <Compass className="size-6" />
      </div>
      <p className="text-muted-foreground text-sm font-medium">404</p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight">找不到这个页面</h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
        你要查看的房源可能已经下架，或者链接不正确。
      </p>

      <div className="mt-6 flex gap-2">
        <Button asChild className="gap-2">
          <Link href="/search">
            <Search className="size-4" />
            去搜索房源
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    </div>
  );
}
