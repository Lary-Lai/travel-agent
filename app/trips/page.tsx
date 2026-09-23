import { connection } from "next/server";

import { TripsView } from "@/components/trips-view";

export const metadata = {
  title: "我的行程",
  description: "查看与管理你的预订订单。",
};

export default async function TripsPage() {
  await connection();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <TripsView />
    </div>
  );
}
