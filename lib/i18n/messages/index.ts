/**
 * Per-group message modules.
 *
 * Beyond the main dictionary, translations are split into one module per feature
 * group. That exists for a practical reason: the remaining UI surfaces were
 * translated in parallel, and a single shared dictionary file would have had
 * several writers racing on the same lines. One file per group means no two
 * writers ever touch the same file, and each module owns its own namespace.
 *
 * Keys inside a module are flat and prefixed with the group name
 * (`account.title`, not `title`), so `translate()` can route by the first
 * segment and the namespaces can never collide.
 */
import { account } from "./account";
import { auth } from "./auth";
import { agentUi } from "./agentUi";
import { forum } from "./forum";
import { globals } from "./globals";
import { media } from "./media";
import { notifications } from "./notifications";
import { payment } from "./payment";
import { social } from "./social";
import { trips } from "./trips";
import { wishlist } from "./wishlist";
import type { Locale } from "../locales";

export const MESSAGE_MODULES = {
  account,
  auth,
  wishlist,
  trips,
  payment,
  media,
  agentUi,
  globals,
  social,
  forum,
  notifications,
} as const;

export type ModuleName = keyof typeof MESSAGE_MODULES;

/** Look up a module's value for a locale, tolerating a locale not yet filled in. */
export function moduleValue(
  module: ModuleName,
  locale: Locale,
  key: string,
): string | undefined {
  const table = MESSAGE_MODULES[module][locale] as Record<string, string> | undefined;
  return table?.[key];
}

/**
 * Every flat key a module defines for the reference locale — used both for the
 * `TranslationKey` union and by `verify-i18n.ts` for parity checks.
 */
export function moduleKeys(module: ModuleName): string[] {
  return Object.keys(MESSAGE_MODULES[module]["zh-CN"] as Record<string, string>);
}

/**
 * Module keys are accepted as `<module>.<anything>`.
 *
 * Ideally this would be the exact literal union of every module's keys. Deriving
 * that from `MESSAGE_MODULES` ran into `keyof (A | B)` being the *intersection*
 * of key sets, and the distributive workaround did not resolve reliably, so the
 * type is deliberately widened here rather than left subtle or broken.
 *
 * Nothing is lost in practice, because the exactness is enforced elsewhere:
 * `scripts/verify-i18n.ts` asserts each module's locales define identical key
 * sets AND that every key actually resolves through `translate()` — an unknown
 * key renders as the key name itself, so a typo shows up in the UI and fails the
 * suite. The main dictionary keeps full per-key typing.
 */
export type ModuleKey = `${ModuleName}.${string}`;
