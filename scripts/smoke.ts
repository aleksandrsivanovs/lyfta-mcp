/**
 * Live read smoke test. Requires a real LYFTA_API_KEY in env. Not run in CI.
 * Prints only status + counts — never the key or workout contents.
 *
 *   LYFTA_API_KEY=<real> npm run smoke
 */
import { LyftaClient } from "../src/lyfta-client.js";

const key = process.env.LYFTA_API_KEY;
if (!key) {
  console.error("set LYFTA_API_KEY");
  process.exit(1);
}

const c = new LyftaClient(key);

const s: any = await c.listWorkoutSummaries({ limit: 1 });
console.log("summaries:", s.status, "total_records:", s.total_records);

const e: any = await c.listExercises();
console.log("exercises:", e.status, "count:", e.count);

const w: any = await c.listWorkouts({ limit: 1 });
console.log("workouts:", w.status, "count:", w.count);

const cols: any = await c.listCollections({ limit: 1 });
console.log("collections:", cols.status, "total_records:", cols.total_records);
const colId = cols.collections?.[0]?.id;
if (colId !== undefined) {
  const col: any = await c.getCollection(String(colId));
  console.log("collection:", col.status, "workout_count:", col.data?.workout_count);
} else {
  console.log("collection: skipped (no collections)");
}

const tpls: any = await c.listTemplates({ limit: 1 });
console.log("templates:", tpls.status, "total_records:", tpls.total_records);
const tplId = tpls.templates?.[0]?.id;
if (tplId !== undefined) {
  const tpl: any = await c.getTemplate(String(tplId));
  console.log("template:", tpl.status, "exercises:", tpl.data?.exercises?.length);
} else {
  console.log("template: skipped (no templates)");
}

const sched: any = await c.getSchedule();
console.log("schedule:", sched.status, "count:", sched.workouts?.length);

const lib: any = await c.searchExerciseLibrary({ limit: 1 });
console.log("library:", lib.status, "total:", lib.data?.pagination?.total);
