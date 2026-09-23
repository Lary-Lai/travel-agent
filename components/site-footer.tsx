import Link from "next/link";
import { Compass } from "lucide-react";

const COLUMNS = [
  {
    title: "探索",
    links: [
      { label: "东京房源", href: "/search?location=tokyo" },
      { label: "巴黎房源", href: "/search?location=paris" },
      { label: "伦敦房源", href: "/search?location=london" },
      { label: "纽约房源", href: "/search?location=new%20york" },
    ],
  },
  {
    title: "我的空间",
    links: [
      { label: "心愿单", href: "/wishlist" },
      { label: "我的行程", href: "/trips" },
      { label: "登录", href: "/login" },
      { label: "注册", href: "/register" },
    ],
  },
  {
    title: "关于",
    links: [
      { label: "AI Agent 用法", href: "/#agent" },
      { label: "搜索房源", href: "/search" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-border mt-16 border-t">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
              <Compass className="size-4" />
            </span>
            <span className="text-base font-semibold">旅居 Agent</span>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            AI 驱动的旅游住宿平台。真实数据库驱动的房源搜索，加上一个真正参与业务流程的 AI Travel Agent。
          </p>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.title} className="space-y-3">
            <h3 className="text-sm font-semibold">{column.title}</h3>
            <ul className="space-y-2">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} 旅居 Agent · 课程演示项目，不接入真实支付</p>
          <p>Next.js · Prisma · PostgreSQL · AI SDK</p>
        </div>
      </div>
    </footer>
  );
}
