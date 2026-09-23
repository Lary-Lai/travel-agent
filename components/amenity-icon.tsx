import {
  AirVent,
  ArrowUpDown,
  Baby,
  Bath,
  Beef,
  BellRing,
  CalendarClock,
  Check,
  CircleParking,
  Coffee,
  CookingPot,
  Droplets,
  Dumbbell,
  Flame,
  KeyRound,
  Laptop,
  PawPrint,
  ShieldAlert,
  Shirt,
  Sun,
  TrainFront,
  Trees,
  Tv,
  WashingMachine,
  Waves,
  Wifi,
  Wind,
} from "lucide-react";

import type { ComponentType } from "react";

/**
 * Explicit icon registry.
 * Deliberately NOT a dynamic `lucide-react[...]` lookup: importing the whole
 * icon set would pull thousands of modules into the bundle.
 */
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Wifi,
  CookingPot,
  AirVent,
  Flame,
  WashingMachine,
  Tv,
  Laptop,
  Shirt,
  Wind,
  Droplets,
  Bath,
  Waves,
  Dumbbell,
  Sun,
  Trees,
  Beef,
  CircleParking,
  ArrowUpDown,
  TrainFront,
  Coffee,
  KeyRound,
  PawPrint,
  CalendarClock,
  Baby,
  BellRing,
  ShieldAlert,
};

export function AmenityIcon({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const Icon = (name ? ICONS[name] : undefined) ?? Check;
  return <Icon className={className} />;
}
