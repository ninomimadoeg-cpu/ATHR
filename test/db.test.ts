// Database security tests (Phase 1 step 3). Run against a throwaway Postgres:
//   TEST_PG_ADMIN_URL=postgres://postgres@localhost:54329/postgres npm test
// Each run creates a fresh database, applies the Supabase stub + migrations, and acts as real users via RLS.
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ADMIN = process.env.TEST_PG_ADMIN_URL;
const DB = "sp_rls_" + randomUUID().slice(0, 8);
let db: pg.Client;

const U = { owner: randomUUID(), siteA: randomUUID(), siteB: randomUUID(), stranger: randomUUID() };
const P1 = randomUUID(), P2 = randomUUID();
const ids: Record<string, string> = {};

/** Run `fn` as a signed-in user, inside a transaction that is rolled back unless `keep`. */
async function as<T>(user: string | null, fn: () => Promise<T>, keep = false): Promise<T> {
  await db.query("begin");
  try {
    if (user) {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    } else await db.query("set local role anon");
    const r = await fn();
    await db.query(keep ? "commit" : "rollback");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}
const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
const rows = async (sql: string, params: unknown[] = []) => (await q(sql, params)).rows;
const fails = async (sql: string, params: unknown[] = []) => {
  await q("savepoint t");
  try { await q(sql, params); await q("release savepoint t"); return false } catch { await q("rollback to savepoint t"); return true }
};

describe.skipIf(!ADMIN)("database security (RLS)", () => {
  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN });
    await admin.connect();
    await admin.query(`create database ${DB}`);
    await admin.end();
    db = new pg.Client({ connectionString: ADMIN!.replace(/\/[^/]*$/, "/" + DB) });
    await db.connect();
    await q(readFileSync("supabase/tests/supabase-stub.sql", "utf8"));
    for (const f of readdirSync("supabase/migrations").sort()) await q(readFileSync("supabase/migrations/" + f, "utf8"));

    // seed as the database owner (bypasses RLS)
    for (const [name, id] of Object.entries(U))
      await q("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, name + "@site.local", { full_name: name }]);
    await q("update profiles set is_owner = true where id = $1", [U.owner]);
    for (const [p, code] of [[P1, "wg5"], [P2, "villa"]]) {
      await q("insert into projects (id, code, name_en, start_date, end_date) values ($1, $2, $2, '2026-11-01', '2027-02-27')", [p, code]);
      await q("insert into trades (project_id, code, name_en) values ($1, 'F', 'Finishes'), ($1, 'G', 'General')", [p]);
      ids[code + ":GEN"] = (await rows("insert into areas (project_id, code, name_en, kind) values ($1, 'GEN', 'Whole site', 'gen') returning id", [p]))[0].id;
      ids[code + ":BED1"] = (await rows("insert into areas (project_id, code, name_en) values ($1, 'BED1', 'Bedroom 1') returning id", [p]))[0].id;
      ids[code + ":act"] = (await rows("insert into activities (project_id, code, name_en, start_date, end_date) values ($1, 'paint', 'Painting', '2026-11-01', '2026-12-31') returning id", [p]))[0].id;
      ids[code + ":item"] = (await rows("insert into boq_items (project_id, ref, trade_code, name_en, unit, qty, rate) values ($1, 'F4.1', 'F', 'Wall painting', 'm²', 100, 220) returning id", [p]))[0].id;
      ids[code + ":stage"] = (await rows("insert into item_stages (item_id, code, name_en, weight, activity_id) values ($1, 'all', 'All', 100, $2) returning id", [ids[code + ":item"], ids[code + ":act"]]))[0].id;
      await q("insert into allocations (item_id, area_id, qty) values ($1, $2, 100)", [ids[code + ":item"], ids[code + ":BED1"]]);
    }
    await q("insert into project_members values ($1, $2, 'site'), ($3, $4, 'site')", [P1, U.siteA, P2, U.siteB]);
  });
  afterAll(async () => {
    if (!db) return;
    await db.end();
    const admin = new pg.Client({ connectionString: ADMIN });
    await admin.connect();
    await admin.query(`drop database if exists ${DB} with (force)`);
    await admin.end();
  });

  const entry = (project: string, code: string, by: string, status = "entered") => [randomUUID(), project, ids[code + ":item"], ids[code + ":BED1"], ids[code + ":stage"], by, status];
  const INSERT_ENTRY = "insert into progress_entries (id, project_id, item_id, area_id, stage_id, work_date, kind, value, created_by, created_at, status) values ($1,$2,$3,$4,$5,'2026-11-24','add',5,$6,now(),$7)";

  describe("money is hidden from site engineers", () => {
    it("site cannot read the rate column", () => as(U.siteA, async () => {
      expect(await fails("select rate from boq_items")).toBe(true);
      expect(await fails("select * from boq_items")).toBe(true);
    }));
    it("site can read the other item columns of its project", () => as(U.siteA, async () => {
      const r = await rows("select ref, qty, unit from boq_items");
      expect(r).toEqual([{ ref: "F4.1", qty: "100", unit: "m²" }]);
    }));
    it("boq_rates returns nothing for site, rates for the owner", async () => {
      expect(await as(U.siteA, () => rows("select * from boq_rates($1)", [P1]))).toEqual([]);
      expect(await as(U.owner, () => rows("select rate from boq_rates($1)", [P1]))).toEqual([{ rate: "220" }]);
    });
    it("site cannot see change orders, revisions, finance or the finish schedule", () => as(U.siteA, async () => {
      for (const t of ["change_orders", "change_order_lines", "baseline_revisions", "project_finance", "finish_schedules"])
        expect([t, await rows(`select * from ${t}`)]).toEqual([t, []]);
    }));
    it("site cannot create a change order", () => as(U.siteA, async () => {
      expect(await fails("insert into change_orders (project_id, number, title) values ($1, 'CO-99', 'x')", [P1])).toBe(true);
    }));
  });

  describe("projects are separated", () => {
    it("site A sees only its own project", () => as(U.siteA, async () => {
      expect((await rows("select code from projects")).map((r) => r.code)).toEqual(["wg5"]);
      expect((await rows("select count(*)::int n from areas")).at(0)?.n).toBe(2);
      expect(await rows("select id from boq_items where project_id = $1", [P2])).toEqual([]);
    }));
    it("a user with no project sees nothing; anonymous sees nothing", async () => {
      expect(await as(U.stranger, () => rows("select * from projects"))).toEqual([]);
      expect(await as(null, () => rows("select * from projects"))).toEqual([]);
    });
    it("site A cannot record progress on project 2", () => as(U.siteA, async () => {
      expect(await fails(INSERT_ENTRY, entry(P2, "villa", U.siteA))).toBe(true);
    }));
    it("an entry cannot point at another project's area or item", () => as(U.siteA, async () => {
      const e = entry(P1, "wg5", U.siteA);
      e[3] = ids["villa:BED1"];
      expect(await fails(INSERT_ENTRY, e)).toBe(true);
    }));
  });

  describe("site entries", () => {
    it("site records its own entry; it counts at once as 'entered'", () => as(U.siteA, async () => {
      expect(await fails(INSERT_ENTRY, entry(P1, "wg5", U.siteA))).toBe(false);
    }));
    it("the same entry sent twice is rejected (no duplicates from retries)", () => as(U.siteA, async () => {
      const e = entry(P1, "wg5", U.siteA);
      await q(INSERT_ENTRY, e);
      expect(await fails(INSERT_ENTRY, e)).toBe(true);
    }));
    it("site cannot record as someone else, or as approved", () => as(U.siteA, async () => {
      expect(await fails(INSERT_ENTRY, entry(P1, "wg5", U.owner))).toBe(true);
      expect(await fails(INSERT_ENTRY, entry(P1, "wg5", U.siteA, "approved"))).toBe(true);
    }));
    it("site cannot approve; owner can", async () => {
      const e = entry(P1, "wg5", U.siteA);
      await as(U.siteA, () => q(INSERT_ENTRY, e), true);
      await as(U.siteA, async () => {
        await q("update progress_entries set status = 'approved' where id = $1", [e[0]]);
        expect((await rows("select status from progress_entries where id = $1", [e[0]]))[0].status).toBe("entered");
      });
      await as(U.owner, () => q("update progress_entries set status = 'approved', approved_by = $2 where id = $1", [e[0], U.owner]), true);
      // once approved the site can no longer delete it
      await as(U.siteA, async () => {
        await q("delete from progress_entries where id = $1", [e[0]]);
        expect(await rows("select id from progress_entries where id = $1", [e[0]])).toHaveLength(1);
      });
    });
    it("site deletes its own unapproved entry", async () => {
      const e = entry(P1, "wg5", U.siteA);
      await as(U.siteA, () => q(INSERT_ENTRY, e), true);
      await as(U.siteA, async () => {
        await q("delete from progress_entries where id = $1", [e[0]]);
        expect(await rows("select id from progress_entries where id = $1", [e[0]])).toHaveLength(0);
      }, true);
    });
    it("a note needs no item (daily diary)", () => as(U.siteA, async () => {
      expect(await fails("insert into progress_entries (id, project_id, area_id, work_date, kind, note, created_by, created_at) values ($1,$2,$3,'2026-11-24','note','tiles arrived',$4,now())",
        [randomUUID(), P1, ids["wg5:GEN"], U.siteA])).toBe(false);
    }));
    it("nobody can make themselves owner", () => as(U.siteA, async () => {
      expect(await fails("update profiles set is_owner = true where id = $1", [U.siteA])).toBe(true);
    }));
  });

  describe("proposals from site", () => {
    it("site proposes; sees only its own; cannot accept it; owner decides", async () => {
      const id = randomUUID();
      await as(U.siteA, () => q("insert into proposals (id, project_id, kind, text, area_id, created_by) values ($1, $2, 'variation', 'extra socket', $3, $4)", [id, P1, ids["wg5:BED1"], U.siteA]), true);
      await as(U.siteA, async () => {
        await q("update proposals set status = 'accepted' where id = $1", [id]);
        expect((await rows("select status from proposals where id = $1", [id]))[0].status).toBe("proposed");
      });
      expect(await as(U.siteB, () => rows("select id from proposals"))).toEqual([]);
      await as(U.owner, () => q("update proposals set status = 'accepted', decided_by = $2 where id = $1", [id, U.owner]), true);
      expect((await as(U.siteA, () => rows("select status from proposals where id = $1", [id])))[0].status).toBe("accepted");
    });
  });

  describe("change orders", () => {
    it("owner approves: snapshot kept, lines applied, end date extended, revision bumped", async () => {
      const co = randomUUID();
      await as(U.owner, async () => {
        await q("insert into change_orders (id, project_id, number, title, value, extra_days) values ($1, $2, 'CO-01', 'Extra ceiling', 38500, 7)", [co, P1]);
        await q("insert into change_order_lines (change_order_id, type, description, trade_code, unit, qty, rate, area_id, sort) values ($1, 'add', 'Gypsum ceiling', 'F', 'm²', 22, 1750, $2, 1)", [co, ids["wg5:BED1"]]);
        await q("insert into change_order_lines (change_order_id, type, item_id, qty, sort) values ($1, 'qty', $2, 120, 2)", [co, ids["wg5:item"]]);
      }, true);
      expect(await as(U.siteA, () => fails("select apply_change_order($1)", [co]))).toBe(true);
      const rev = await as(U.owner, async () => (await rows("select apply_change_order($1) r", [co]))[0].r, true);
      expect(rev).toBe(2);
      const p = (await rows("select end_date::text, baseline_rev from projects where id = $1", [P1]))[0];
      expect(p).toEqual({ end_date: "2027-03-06", baseline_rev: 2 });
      expect((await rows("select rev, note from baseline_revisions where project_id = $1", [P1]))).toEqual([{ rev: 1, note: "CO-01 Extra ceiling" }]);
      expect((await rows("select original_bac from project_finance where project_id = $1", [P1]))[0].original_bac).toBe("22000");
      const items = await rows("select ref, qty::float, rate::float from boq_items where project_id = $1 order by ref", [P1]);
      expect(items).toEqual([{ ref: "CO01.1", qty: 22, rate: 1750 }, { ref: "F4.1", qty: 120, rate: 220 }]);
      expect((await rows("select qty::float from allocations where item_id = $1", [ids["wg5:item"]]))[0].qty).toBe(120);
      expect((await rows("select old_qty::float from change_order_lines where type = 'qty'"))[0].old_qty).toBe(100);
      expect(await as(U.owner, () => fails("select apply_change_order($1)", [co]))).toBe(true); // not twice
    });
  });

  describe("photo storage", () => {
    it("site uploads only into its own project's folder and reads only its project", async () => {
      await as(U.siteA, async () => {
        expect(await fails("insert into storage.objects (bucket_id, name) values ('photos', $1)", [`${P1}/${randomUUID()}/1.jpg`])).toBe(false);
        expect(await fails("insert into storage.objects (bucket_id, name) values ('photos', $1)", [`${P2}/${randomUUID()}/1.jpg`])).toBe(true);
        expect(await fails("insert into storage.objects (bucket_id, name) values ('photos', 'not-a-project/1.jpg')")).toBe(true);
      });
      await q("insert into storage.objects (bucket_id, name) values ('photos', $1), ('photos', $2)", [`${P1}/x/1.jpg`, `${P2}/y/1.jpg`]);
      expect((await as(U.siteA, () => rows("select name from storage.objects"))).map((r) => r.name)).toEqual([`${P1}/x/1.jpg`]);
    });
    it("only managers delete photos (archiving)", async () => {
      await as(U.siteA, async () => {
        await q("delete from storage.objects where name = $1", [`${P1}/x/1.jpg`]);
        expect(await rows("select name from storage.objects where name = $1", [`${P1}/x/1.jpg`])).toHaveLength(1);
      });
      await as(U.owner, async () => {
        await q("delete from storage.objects where name = $1", [`${P1}/x/1.jpg`]);
        expect(await rows("select name from storage.objects where name = $1", [`${P1}/x/1.jpg`])).toHaveLength(0);
      });
    });
  });
});
