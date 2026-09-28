import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { PaymentPanel } from "@/components/payment-panel";
import { getCurrentUser } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { getTranslator } from "@/lib/i18n/server";
import { getBooking } from "@/server/booking.service";

type Props = { params: Promise<{ bookingId: string }> };

export async function generateMetadata() {
  // A Server Component, so the translator is awaited rather than read from the
  // client provider; a static `metadata` object cannot be translated at all.
  const { t } = await getTranslator();
  return {
    title: t("payment.title"),
    description: t("payment.description"),
  };
}

export default async function PaymentPage({ params }: Props) {
  await connection();
  const { bookingId } = await params;

  // Checkout is private: never render someone else's order.
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/payment/${bookingId}`)}`);
  }

  let booking;
  try {
    booking = await getBooking(user.id, bookingId);
  } catch (error) {
    // Unknown order or one that belongs to another user is a 404 page.
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <PaymentPanel booking={booking} />
    </div>
  );
}
