---
title: "Reading data back: the format as data, not as statements"
description: "Three refactors in the spawn check's verifier: one statement per field became a table of fields plus one generic step, an if/else chain over line kinds became a table of handlers, and a run of map assignments became a list of rows converted once. Why each is easier to read, extend and check, and where the pattern stops paying."
---

# Reading data back: the format as data, not as statements

A learning piece from the spawn check (`src/verify/spawn.ts`). The examples are three small
functions that read the game's log and files back into named values, but the same shapes turn up wherever
structured lines are read back: telemetry, test output, any `key=value` record format. The lesson is
general: when a function repeats one operation for a list of things, or picks one of several
operations by name, the list or the names are data, and the code should say so.

- **Example 1**, the fields of one line: one statement per field becomes a table of fields.
- **Example 2**, the kinds of line: an `if`/`else` chain becomes a table of handlers.
- **Example 3**, the values a file gives: a run of map assignments becomes a list of rows, with the
  shared conversion written once.

## Example 1: the fields of one line

### The job

The game's Lua writes one line per spawned creature (`test/lua/a7xspawn.lua`):

```text
A7XSPAWN 2 creature 143067270 resref=DADROW8 block=derived hp=34/34 ac=6,0,0,0,0 thac0=18 saves=13,9,11,13,10 resist=0,0,0,0,0,0,0,0,0,0 mr=66 ea=128
```

`creatureValues` receives everything after `creature` and must return the id, the resref, the stats
block, the HP as written, and a map from field names such as `ac.missile` or `save.wand` to values,
which `compareCreature` then checks against the creature's `.cre` file.

There are two jobs in that: **splitting** the line into keys and values, and **mapping** each key's
value onto the comparison's field names. The mapping is the part that varies by field.

### Before

```ts
/** A creature line's fields, named as the comparison names them. */
function creatureValues(rest: string): SpawnedCreature | null {
  const words = rest.split(" ");
  const id = words[0];
  const kv = new Map(
    words.slice(1).map((w) => [w.slice(0, w.indexOf("=")), w.slice(w.indexOf("=") + 1)]),
  );
  const resref = kv.get("resref");
  if (!id || !resref) return null;
  const values = new Map<string, string>();
  const [cur, max] = (kv.get("hp") ?? "").split("/");
  values.set("hp.max", max ?? "");
  const ac = (kv.get("ac") ?? "").split(",");
  ["ac", "ac.crushing", "ac.missile", "ac.piercing", "ac.slashing"].forEach((f, i) =>
    values.set(f, ac[i] ?? "")
  );
  values.set("thac0", kv.get("thac0") ?? "");
  const saves = (kv.get("saves") ?? "").split(",");
  CRE_SAVES.forEach((s, i) => values.set(`save.${s}`, saves[i] ?? ""));
  const resist = (kv.get("resist") ?? "").split(",");
  WALKER_RESISTS.forEach((r, i) => values.set(`resist.${r}`, resist[i] ?? ""));
  values.set("mr", kv.get("mr") ?? "");
  values.set("ea", kv.get("ea") ?? "");
  return { id, resref, block: kv.get("block") ?? "", hp: `${cur}/${max}`, values };
}
```

It works, and the tests pass. But the line format is spread across twelve statements, and five of
them are the same operation, "split this key's value on commas and give each part a name", written
out five times with small differences: a literal list here, a `map` over a constant there, a single
`set` for one-value keys.

### After

```ts
/**
 * Each creature-line key whose value is a comma-separated list, and the fields it fills, in the
 * order test/lua/a7xspawn.lua writes them. HP is not here: its separator is "/", and only its
 * maximum is compared.
 */
const LISTS: [key: string, fields: readonly string[]][] = [
  ["ac", ["ac", "ac.crushing", "ac.missile", "ac.piercing", "ac.slashing"]],
  ["thac0", ["thac0"]],
  ["saves", CRE_SAVES.map((s) => `save.${s}`)],
  ["resist", WALKER_RESISTS.map((r) => `resist.${r}`)],
  ["mr", ["mr"]],
  ["ea", ["ea"]],
];

/** A creature line's fields, named as the comparison names them. */
function creatureValues(rest: string): SpawnedCreature | null {
  const [id, ...words] = rest.split(" ");
  const kv = new Map(words.map((w) => {
    const at = w.indexOf("=");
    return [w.slice(0, at), w.slice(at + 1)];
  }));
  const resref = kv.get("resref");
  if (!id || !resref) return null;
  const [cur, max = ""] = (kv.get("hp") ?? "").split("/");
  const values = new Map<string, string>([
    ["hp.max", max],
    ...LISTS.flatMap(([key, fields]) => {
      const parts = (kv.get(key) ?? "").split(",");
      return fields.map((f, i): [string, string] => [f, parts[i] ?? ""]);
    }),
  ]);
  return { id, resref, block: kv.get("block") ?? "", hp: `${cur}/${max}`, values };
}
```

### Why this is better

- **The format reads as a table.** `LISTS` is the line format, key by key, in the order the Lua side
  writes it. Checking the parser against `a7xspawn.lua` means reading two lists side by side, not
  tracing statements. A reader sees at a glance that `saves` fills five fields and `thac0` one.
- **One operation is written once.** The split-and-name step exists in one place, so a fix or a change
  to it (trimming spaces, say) applies to every field. In the "before" version, each of the five
  copies could drift on its own: one forgetting `?? ""`, one splitting on the wrong character.
- **Adding a field is adding a row.** When the check grows a field, the change is one line of data
  beside its neighbours, and a reviewer sees exactly what was added. Before, it was a new statement
  whose shape depended on which of the three patterns the author copied.
- **One-value keys stop being special.** `thac0`, `mr` and `ea` are lists of one field. The "before"
  version handled them with their own `set` calls, a third pattern that only existed because the
  general one had not been named.
- **The map is built, not mutated.** `values` is one expression from its inputs. Nothing assigns to it
  later, so there is no order of statements to get wrong and no half-filled state to reason about.
- **Smaller fixes come along.** Destructuring (`const [id, ...words]`) replaces `words[0]` and
  `words.slice(1)`; `indexOf("=")` is computed once per word instead of twice; `max = ""` gives the
  default where the value is declared instead of where it is used.

The behaviour is unchanged, which is what made this a safe refactor: the existing tests in
`test/verify/spawn_test.ts` pass untouched, and `deno task verify` judges both real spawn-check logs
exactly as before.

## Example 2: the kinds of line

### The job

The spawn check writes four kinds of line, all starting `A7XSPAWN <run> <kind>`:

```text
A7XSPAWN 1 spawn COWH ok
A7XSPAWN 1 creature 142936196 resref=COWH block=derived hp=60/60 ...
A7XSPAWN 1 header 142936196 ffffffffffffff7f...
A7XSPAWN 1 error no console object C
```

`parseSpawns` groups the lines of a log by run number and, for each line, adds what its kind carries
to that run. Again two jobs: **grouping** lines into runs, and **what each kind adds**.

### Before

```ts
export function parseSpawns(log: string): SpawnRun[] {
  const runs = new Map<number, SpawnRun>();
  for (const raw of log.split("\n")) {
    const m = raw.trimEnd().match(LINE);
    if (!m) continue;
    const n = Number(m[1]);
    const run: SpawnRun = runs.get(n) ?? { run: n, spawned: [], creatures: [], headers: new Map() };
    runs.set(n, run);
    const [, , kind, rest] = m;
    if (kind === "spawn") {
      const [resref, result, ...why] = rest.split(" ");
      run.spawned.push({ resref, ok: result === "ok", why: why.join(" ") });
    } else if (kind === "creature") {
      const c = creatureValues(rest);
      if (c) run.creatures.push(c);
    } else if (kind === "header") {
      const [id, hex] = rest.split(" ");
      run.headers.set(id, hexBytes(hex ?? ""));
    } else if (kind === "error") {
      run.error = rest;
    }
  }
  return [...runs.values()].sort((a, b) => a.run - b.run);
}
```

The grouping and the four kinds are interleaved in one loop body: to find what a `header` line does,
a reader has to read past the matching, the run bookkeeping and two other branches, and to see which
kinds exist at all, scan the chain for its `kind ===` tests.

### After

```ts
/** What each kind of A7XSPAWN line adds to its run. */
const KINDS: Record<string, (run: SpawnRun, rest: string) => void> = {
  spawn(run, rest) {
    const [resref, result, ...why] = rest.split(" ");
    run.spawned.push({ resref, ok: result === "ok", why: why.join(" ") });
  },
  creature(run, rest) {
    const c = creatureValues(rest);
    if (c) run.creatures.push(c);
  },
  header(run, rest) {
    const [id, hex = ""] = rest.split(" ");
    run.headers.set(id, hexBytes(hex));
  },
  error(run, rest) {
    run.error = rest;
  },
};

/** Every run of the spawn check in a log, in run order. */
export function parseSpawns(log: string): SpawnRun[] {
  const runs = new Map<number, SpawnRun>();
  for (const raw of log.split("\n")) {
    const [, n, kind, rest] = raw.trimEnd().match(LINE) ?? [];
    if (!n) continue;
    const run: SpawnRun = runs.get(Number(n)) ??
      { run: Number(n), spawned: [], creatures: [], headers: new Map() };
    runs.set(run.run, run);
    KINDS[kind]?.(run, rest);
  }
  return [...runs.values()].sort((a, b) => a.run - b.run);
}
```

### Why this is better

- **The loop says what it does in three steps**: match the line, find its run, hand the rest to its
  kind. The grouping can be read without reading any kind, and a kind without the grouping.
- **The kinds are listed in one place.** `KINDS` names every kind of line the check writes, each with
  its own parsing next to its name, so it can be read against `a7xspawn.lua`'s header comment, which
  lists the same four.
- **A new kind is a new entry**, not a new branch threaded into a chain. A misspelled kind is still
  silently ignored, as it was before, but the spellings now sit together as keys, where a reader
  checking them against the Lua side sees them all at once.
- **Unknown kinds need no code.** `KINDS[kind]?.(...)` ignores a kind with no entry, which the chain
  did by falling off its end; now the rule is visible in one expression.

Behaviour is again unchanged: an unknown kind is still ignored, and a line of an unknown kind still
creates its run, because the run is looked up before the kind is dispatched. The tests pass untouched
and both spawn-check logs judge as before.

## Example 3: the values a file gives

### The job

`fileValues` gives, for each field the spawn check compares, the value the creature's `.cre` file
holds, as text, so `compareCreature` can set it beside the walker's. One field has a rule: the AC the
engine uses is the file's plus a Dexterity adjustment, `dexAc`, from the game's `DEXMOD.2DA`.

### Before

```ts
export function fileValues(cre: Creature, dexAc: number): Map<string, string> {
  const v = new Map<string, string>();
  v.set("hp.max", String(cre.maxHp));
  v.set("ac", String(cre.acEffective + dexAc));
  v.set("ac.crushing", String(cre.acCrushing));
  v.set("ac.missile", String(cre.acMissile));
  v.set("ac.piercing", String(cre.acPiercing));
  v.set("ac.slashing", String(cre.acSlashing));
  v.set("thac0", String(cre.thac0));
  for (const s of CRE_SAVES) v.set(`save.${s}`, String(cre.saves[s]));
  for (const r of WALKER_RESISTS) v.set(`resist.${r}`, String(cre.resistances[r]));
  v.set("mr", String(cre.resistances.magic));
  v.set("ea", String(cre.ea));
  return v;
}
```

Nothing here is parsed twice; the repetition is smaller: every line is `v.set(..., String(...))`, and
the two loops are a third and fourth way of writing the same assignment. What varies, the field and
where its value comes from, sits inside the repeated boilerplate.

### After

```ts
export function fileValues(cre: Creature, dexAc: number): Map<string, string> {
  const fields: [field: string, value: number][] = [
    ["hp.max", cre.maxHp],
    ["ac", cre.acEffective + dexAc],
    ["ac.crushing", cre.acCrushing],
    ["ac.missile", cre.acMissile],
    ["ac.piercing", cre.acPiercing],
    ["ac.slashing", cre.acSlashing],
    ["thac0", cre.thac0],
    ...CRE_SAVES.map((s): [string, number] => [`save.${s}`, cre.saves[s]]),
    ...WALKER_RESISTS.map((r): [string, number] => [`resist.${r}`, cre.resistances[r]]),
    ["mr", cre.resistances.magic],
    ["ea", cre.ea],
  ];
  return new Map(fields.map(([field, value]) => [field, String(value)]));
}
```

### Why this is better

- **Each row says only what varies**: the field, and where its value comes from. Turning numbers into
  text and building the map happen once, on the last line.
- **The rules stand out.** `ac` is the only row with arithmetic, so the Dexterity rule is visible
  at a glance instead of being one `String(...)` among twelve; `mr` reading the file's magic
  resistance is likewise one plain row.
- **The value is built, not mutated**, as in the other two examples: one expression, no half-filled
  map.

Unlike example 1's `LISTS`, this table cannot be a constant: each row reads from `cre`, so it is
built per call. That costs nothing that matters for a handful of creatures. Behaviour is unchanged:
the tests pass untouched, and both spawn-check logs judge as before, 96 fields equal in each.

## Where the pattern stops paying

In example 1, HP is deliberately not in the table. Its separator is `/` rather than `,`, and only its maximum is
compared while the current value is kept as written for the report. Folding it in would mean a
separator column and a way to mark a part as not compared: two new concepts in the table to serve one
row. A table earns its place when its rows are alike; the honest move is to keep the one real
exception explicit, beside the table, with a comment saying why.

The same judgment applies generally:

- **Make it data** when several cases are the same operation with different parameters.
- **Keep it code** when a case needs its own logic; a table with flags for exceptions is code in
  disguise, and harder to read than the code was.
- **Name the boundary** in a comment, so the next reader does not "fix" the exception into the table.

Examples 1 and 3 now name the same fields, one from the log line and one from the file. A single
shared field table could remove that duplication, but its two columns would be of different kinds:
a position in a comma-separated list for the walker, a read from the `.cre` for the file. That is
the "flags for exceptions" case above in another form, so the two tables stay separate. A field
missing from either side is not silent: `compareCreature` looks each file field up among the
walker's values, and a missing name shows as a difference against an empty value.

The creature list's parser, `parseLists` in `src/verify/list.ts`, has the same loop as example 2
and could take the same shape when it next changes. The party check's `parseChecks` groups the same
way but chooses by whether a line is about the party or a member, not by a line kind; forcing it
into a kinds table would hide that difference rather than show it.
