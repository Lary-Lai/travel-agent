// 等同于vite框架下的index.html，本文件只在服务器上运行
import type { Metadata } from "next"; //next.js提供的类型,只导入"类型"，不导入真正的代码(typescript语法，运行时被擦掉)
//  是写给“编译器”和“打包工具”看的说明书，目的是为了更安全、更高效地构建项目
import { Geist, Geist_Mono } from "next/font/google"; //字体
//这是 Next.js 特有的：它在构建时把字体下载到本地，所以用户访问时不用去 Google 服务器取字体(更快且不会受到墙的限制)


import { HeaderErrorBoundary } from "@/components/header-error-boundary"; 
import { LocaleProvider } from "@/components/locale-provider";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LOCALE_META } from "@/lib/i18n/locales";
import { getLocale, getTranslator } from "@/lib/i18n/server";
// @/ 是路径别名，等于项目根目录
// 所以 @/components/providers 就是 travel-agent/components/providers.tsx

import "./globals.css"; // 引入css样式,这是 Tailwind 的入口

const geistSans = Geist({ // 普通JS常量，不是react组件，用于生成一串CSS变量名，用于第58行处
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({ // 普通JS常量，不是react组件，用于下载字体文件
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Metadata is request-scoped: the locale lives in a cookie, so the <title> and
 * description follow the visitor's language like the rest of the page. The
 * product name itself is a brand and stays the same in every locale.
 */
export async function generateMetadata(): Promise<Metadata> { // next.js的异步函数，将返回Promise<>类型，此处返回的是medata类型的数据
  const { t } = await getTranslator();
  const brand = t("globals.brand");

  return {
    title: {
      default: `${brand} · ${t("globals.metaTitle")}`,
      template: `%s · ${brand}`,
    },
    description: t("globals.metaDescription"),
  };
}

//此处children是插槽的意思，来自app/page.tsx中首页的内容会自动被放进{children}中
export default async function RootLayout({ children }: LayoutProps<"/">) { // 默认导出
  // Read the locale on the server so the first paint is already in the right
  // language — no flash of Chinese before a client-side switch.
  const locale = await getLocale();


  // JSX结构
  return (
    <html
      lang={LOCALE_META[locale].htmlLang}
      // next-themes writes the theme class onto <html> before hydration.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} 
      // 此处可以通过把字体装载到html上，之后全站的CSS都能用var(--fong-geist-sans),见第20行
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <LocaleProvider initialLocale={locale}>
          {/* providers出现，此处开始引入context广播全局变量 */}
          <Providers>
            {/* Scoped to the header only: `children` sit outside it, so a crash
                in the navigation can never make the page below unreachable. */}
            <HeaderErrorBoundary>
              <SiteHeader /> {/* 页眉 */}
            </HeaderErrorBoundary>
            <main className="flex-1">{children}</main> 
            {/* class是html的表达方式，此处写成className是因为class是JS保留字 */}
            <SiteFooter /> {/* 页脚 */}
          </Providers>
        </LocaleProvider>
      </body>
    </html>
  );
}
// 页眉和页脚中layout.tsx中被其包裹，因此每个页面都可以有导航栏和页脚
