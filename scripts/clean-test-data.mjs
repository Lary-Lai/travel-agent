/**
 * Remove throwaway accounts left behind by the test suites.
 *
 *     node scripts/clean-test-data.mjs          # report only
 *     node scripts/clean-test-data.mjs --apply  # actually delete
 *
 * Several of the older suites register a temporary account with `@example.com`
 * and never delete it, so repeated runs leave dozens of accounts (路人甲, 搜索测试,
 * Bob …) in the demo database. They are harmless to the schema but they show up
 * as real people: the profile-visibility picker lists the newest accounts as
 * suggestions, so the junk became visible in the UI.
 *
 * The rule is deliberately narrow — `@example.com` is a reserved documentation
 * domain, so no real registration can match it. The demo account and every
 * seeded `@travel-agent.dev` account are excluded, and anything whose email does
 * not match is left alone. Deleting a user cascades to their bookings, reviews,
 * wishlists, posts and friendships (all `onDelete: Cascade`).
 */
import pg from "pg";

const APPLY = process.argv.includes("--apply");

const db = new pg.Client({
  host: "127.0.0.1",
  port: 55432,
  user: "postgres",
  password: "postgres",
  database: "travel_agent",
});
await db.connect();

/** `@example.com` is reserved for documentation and tests — never a real signup. */
const TEST_EMAIL = "%@example.com";

const { rows: doomed } = await db.query(
  `select u.id, u.name, u.email,
          (select count(*) from "Post" p where p."authorId" = u.id) as posts,
          (select count(*) from "Booking" b where b."userId" = u.id) as bookings
   from "User" u
   where u.email like $1
   order by u."createdAt"`,
  [TEST_EMAIL],
);

console.log(`test accounts found: ${doomed.length}`);
for (const row of doomed.slice(0, 8)) {
  console.log(`  ${row.name.padEnd(14)} ${row.email}  (posts ${row.posts}, bookings ${row.bookings})`);
}
if (doomed.length > 8) console.log(`  … and ${doomed.length - 8} more`);

const { rows: kept } = await db.query(
  `select count(*)::int as n from "User" where email not like $1`,
  [TEST_EMAIL],
);
console.log(`\naccounts that will be kept: ${kept[0].n}`);

if (doomed.length === 0) {
  console.log("nothing to do");
  await db.end();
  process.exit(0);
}

if (!APPLY) {
  console.log("\n(report only — re-run with --apply to delete)");
  await db.end();
  process.exit(0);
}

const ids = doomed.map((row) => row.id);
const deleted = await db.query(`delete from "User" where id = any($1::text[])`, [ids]);
console.log(`\ndeleted ${deleted.rowCount} account(s) and everything that cascaded from them`);

const [{ n: remaining }] = (
  await db.query(`select count(*)::int as n from "User" where email like $1`, [TEST_EMAIL])
).rows;
console.log(`test accounts remaining: ${remaining}`);

await db.end();
