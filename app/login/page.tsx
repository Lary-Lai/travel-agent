import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { LoginForm } from "@/components/login-form";
import { getTranslator } from "@/lib/i18n/server";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth";

export async function generateMetadata() {
  const { t } = await getTranslator();
  return {
    title: t("auth.metaLogin"),
    description: t("auth.metaLoginBody"),
  };
}

export default async function LoginPage() {
  await connection();

  // Already signed in? Nothing to do here.
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <Suspense fallback={<Skeleton className="mx-auto h-96 w-full max-w-md rounded-2xl" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
