/**
 * Measures the per-resolve cost of the ownership deep copy introduced for #753.
 *
 * Compares construction + resolve() with the default (copying) options against
 * `mutate: true` (no copy) across shapes Zachary called out: ref-less schemas
 * with large annotations, recursive graphs, and shared graphs.
 *
 * Run: npm run benchmark:copy
 */
const { default: Dereferencer } = require("../build/index.js");

const time = async (label, makeSchema, opts, iters = 7) => {
  const times = [];
  for (let i = 0; i < iters; i++) {
    // Fresh schema AND options per iteration: the constructor stamps
    // rootSchema/recursive onto the options object, so reusing it would
    // resolve against a previous iteration's (already stripped) copy.
    const schema = makeSchema();
    const t0 = process.hrtime.bigint();
    await new Dereferencer(schema, { ...opts }).resolve();
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(iters / 2)];
  console.log(`${label}: median ${median.toFixed(2)}ms over ${iters} runs`);
  return median;
};

const bigAnnotations = (n) => ({
  type: "object",
  title: "big",
  description: "x".repeat(10000),
  examples: Array.from({ length: n }, (_, i) => ({ id: i, name: `example ${i}`, payload: "y".repeat(200) })),
  default: { nested: Array.from({ length: n }, (_, i) => i) },
  properties: { a: { type: "string" } },
});

const recursiveGraph = (depth) => {
  const definitions = {};
  for (let i = 0; i < depth; i++) {
    definitions[`n${i}`] = {
      type: "object",
      properties: { next: { $ref: `#/definitions/n${(i + 1) % depth}` } },
    };
  }
  return {
    type: "object",
    properties: { start: { $ref: "#/definitions/n0" } },
    definitions,
  };
};

const sharedGraph = (n) => {
  const shared = { type: "object", properties: { x: { type: "string" } } };
  const properties = {};
  for (let i = 0; i < n; i++) {
    properties[`p${i}`] = shared;
  }
  return { type: "object", properties };
};

(async () => {
  const cases = [
    ["annotations x2000, no refs", () => bigAnnotations(2000)],
    ["500-node $ref cycle", () => recursiveGraph(500)],
    ["shared node x2000", () => sharedGraph(2000)],
  ];
  console.log("input sizes (JSON bytes):");
  for (const [label, make] of cases) {
    console.log(`  ${label}: ${JSON.stringify(make()).length}`);
  }
  console.log("");
  for (const [label, make] of cases) {
    const copying = await time(`${label} — default (deep copy)`, make, {});
    const inPlace = await time(`${label} — mutate:true (no copy)`, make, { mutate: true });
    console.log(`  -> copy overhead: ${(copying - inPlace).toFixed(2)}ms\n`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
