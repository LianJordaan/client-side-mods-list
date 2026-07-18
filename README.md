# client-side-mods-list

A curated, evidence-backed list of Minecraft mods that are safe to remove from a **server's**
`mods/` directory, and — just as importantly — a list of mods that look client-only but are not.

- Data file: [`data/client-only.json`](data/client-only.json)
- Served from: `https://cloudflare-api.bytebuilders.co.za/cache/client-mods/v1/list.json`
- Health: `https://cloudflare-api.bytebuilders.co.za/cache/client-mods/health`

Current seed: **99 rules** (74 `client-only`, 25 `client-optional`) and **15** protected
libraries.

---

## The one rule that matters

**Over-stripping is far worse than under-stripping.**

Removing a mod that has a server half causes registry desync, missing blocks and items, chunks
that fail to load, and dependency resolution failures on next boot. Leaving a client mod on a
server costs a few megabytes and a little RAM.

So when a mod's sideness is not clear, the correct answer is `client-optional` with a low
confidence — never a guess in the other direction. Several entries in this list are deliberately
held at `high` instead of `verified` for exactly this reason, and each says why in its `notes`.

Mods most commonly got wrong, and which this list gets right:

| Mod | Naive assumption | Reality |
|---|---|---|
| JEI / REI / EMI | Recipe viewer, client-only | Server-side recipe transfer and cheat mode |
| Jade / WTHIT | HUD overlay | Server supplies the block/entity data shown |
| AppleSkin | HUD overlay | Server syncs saturation and exhaustion, which vanilla never sends |
| Lithium / Starlight / Krypton | "Performance mod", like Sodium | Almost entirely **server-side** optimisation |
| FerriteCore | Client FPS mod | Reduces server memory; one of the best mods to keep |
| Distant Horizons | Client render distance | 2.x has a real server-side LOD component |
| JourneyMap | Minimap | Ships a server build with admin controls over what clients may map |

---

## Schema

The file is **strict JSON** — no comments, no trailing commas. The `jsonc` blocks below are
documentation only; do not copy the comments into the data file.

### Top level

```jsonc
{
  "schemaVersion": 1,              // integer >= 1. Bump only on a breaking change.
  "listVersion": "2026.07.18",     // date-ish, human-facing. Bump on every content change.
  "updatedAt": "2026-07-18T00:00:00Z",
  "source":   { "repository": "…", "path": "data/client-only.json", "branch": "main" },
  "matching": { … },               // informational: precedence, tiers, case sensitivity
  "neverRemove": [ … ],            // hard protection list, applied last
  "rules":      [ … ],             // must be non-empty
  "overrides":  { }                // per loader+version corrections
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | integer ≥ 1 | yes | Consumers refuse to strip anything if this is greater than the version they understand. |
| `listVersion` | string | yes | Surfaced by the panel as `listVersion` and by the Worker as `X-List-Version`. |
| `updatedAt` | RFC 3339 string | yes | |
| `source` | object | no | Provenance, for humans. |
| `matching` | object | no | Mirrors the rules below so a consumer can assert agreement. |
| `neverRemove` | array | yes in practice | Missing is tolerated but consumers **log a warning**. An empty array means nothing is protected — almost certainly a mistake. |
| `rules` | array | yes | Must be non-empty. The Worker rejects an empty array as a truncated file. |
| `overrides` | object | no | May be `{}`. |

### A rule

```jsonc
{
  "id": "mr.sodium",                       // stable, unique, never reused
  "name": "Sodium",                        // display name for the cleaner UI
  "sideness": "client-only",               // client-only | client-optional
  "confidence": "verified",                // verified | high | heuristic
  "loaders": ["fabric", "neoforge", "quilt"],
  "reason": "Modrinth server_side=unsupported",   // short; shown in the UI
  "match": {
    "modrinth":   { "projectId": "AANobbMI", "slug": "sodium" },
    // CurseForge ids are numeric but are ALWAYS stored as strings. This one is
    // illustrative only — the seed file omits every CurseForge id it could not
    // verify, and so should you.
    "curseforge": { "projectId": "000000", "slug": "sodium" },
    "filename":   {
      "equals": ["sodium.jar"],
      "prefix": ["sodium-fabric-", "sodium-neoforge-"],
      "regex":  "^sodium-(fabric|neoforge)-.*\\.jar$"
    }
  },
  "evidence": [
    { "source": "modrinth-api",
      "detail": "GET /v2/project/sodium -> client_side=required, server_side=unsupported",
      "checkedAt": "2026-07-18" }
  ],
  "notes": "Rendering engine replacement. No server-side code path at all."
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Unique across the file. Convention: `mr.<slug>` for Modrinth-sourced, `cf.<slug>` for CurseForge-only. Returned by the panel as `ruleId`. |
| `name` | string | yes | |
| `sideness` | enum | yes | See below. |
| `confidence` | enum | yes | See below. |
| `loaders` | string[] | yes | Non-empty. Only `fabric`, `forge`, `neoforge`, `quilt` are meaningful; anything else never matches. Sideness genuinely is loader-dependent — Embeddium/Rubidium are the Forge-side Sodium ports, Sodium itself is Fabric/NeoForge/Quilt. |
| `reason` | string | yes | One short line. Rendered in the cleaner UI next to the checkbox. |
| `match` | object | yes | At least one matcher. See *Matching*. |
| `evidence` | object[] | yes | See *Evidence*. |
| `notes` | string | yes | Free text for maintainers: caveats, dependency relationships, why a tier was chosen. |

### `sideness`

| Value | Meaning |
|---|---|
| `client-only` | No meaningful server-side behaviour. **Safe to auto-strip.** |
| `client-optional` | Has real server functionality. **Must never be auto-stripped** — only surfaced so a human can decide. |

An unknown value is treated as `client-optional`.

### `confidence`

| Tier | Bar for using it |
|---|---|
| `verified` | A hard, checkable signal: Modrinth `server_side: "unsupported"`, or `fabric.mod.json` declaring `"environment": "client"`, or the author documenting it. For `client-optional`, an equally hard signal that a server half exists. |
| `high` | Strong reasoning plus at least one supporting observation, but something is inconsistent — e.g. the author declares `server_side: "optional"` while the mod is functionally client-side. **`high` auto-strips**, so only use it where unattended removal is genuinely safe. |
| `heuristic` | Informed guess. **Never auto-selected.** Use this rather than omitting an entry. |

### Libraries are always `client-optional`

A library's own `server_side: "unsupported"` describes what its *author* said about their mod.
It says nothing about what the mods **left on the server** declare about it — and loader
dependency resolution hard-fails on an unsatisfied `depends` entry regardless of side.

Nothing in this pipeline reads dependency graphs. Nothing parses `depends` or `mods.toml` from
the surviving jars. So a rule saying "safe to strip alongside its dependents" states a
precondition that is **never evaluated**, and the failure mode is not degraded gameplay — it is
the server refusing to boot.

Until a consumer actually resolves dependencies, every library entry is `client-optional`
(surfaced, never auto-selected) or belongs in `neverRemove`. Prism Lib, Searchables, MaLiLib and
libIPN are all classified this way for exactly this reason.

An unknown tier is treated as the lowest tier.

`autoSelect` in the panel is computed as `confidence ∈ {verified, high} AND sideness == client-only`.
So the practical effect of `heuristic` is "show it, never pre-tick it".

### `evidence`

Every rule carries at least one entry. This is what makes the list auditable rather than folklore.

```jsonc
{ "source": "modrinth-api", "detail": "…", "checkedAt": "2026-07-18" }
```

| `source` | Use for |
|---|---|
| `modrinth-api` | A `client_side`/`server_side` reading. Quote the endpoint and both values. |
| `jar-metadata` | `fabric.mod.json` `environment`, or a `mods.toml` observation. Quote the value verbatim, including `*` or "absent". |
| `modrinth-files` | Real published filenames, which is how `filename` matchers are justified. |
| `reasoning` | Human analysis. Say *why*, not just *what*. |

`environment: "*"` is **not** evidence of dual-sidedness on its own — plenty of client mods
declare it out of convenience. It is only enough to stop you writing `verified`.

### `match` and precedence

Most specific wins, evaluated in this order:

1. `modrinth.projectId`
2. `curseforge.projectId`
3. `modrinth.slug`
4. `curseforge.slug`
5. `filename.equals`
6. `filename.prefix`
7. `filename.regex`

Project **ids beat slugs**: a Modrinth slug is a vanity URL the author can change at any time,
while the id is immutable.

- `filename.equals` and `filename.prefix` are **arrays of strings**.
- `filename.regex` is a single string, compiled with JavaScript `RegExp`. The Worker rejects the
  whole list if any regex fails to compile, so a typo here takes the list down rather than
  silently disabling one rule — check it before pushing.
- **Filename matching is case-insensitive.** Real releases are wildly inconsistent:
  `Bookshelf-fabric-…`, `PuzzlesLib-v…`, `ForgeConfigAPIPort-v…`, and both `connector-…` and
  `Connector-…` exist. Compare lowercased on both sides. Write matcher values in lowercase.
- Do **not** invent project ids. An id is the highest-precedence matcher, so a wrong one silently
  mislabels an unrelated mod. If you are not certain, use the slug and filename only and say so in
  `notes` — several entries here do exactly that (`cf.controllable`, `cf.inventory-hud-plus`,
  `Framework`, `MixinExtras`).

### `neverRemove`

A hard post-filter applied **last**. Nothing overrides it — not a rule, not an override, not a
ticked checkbox in the UI. The panel re-validates every filename server-side on
`/cleaner/apply` and rejects the entire request if any protected file is in it.

```jsonc
{
  "id": "protect.fabric-api",
  "name": "Fabric API",
  "match": {
    "modrinth": { "projectId": "P7dR8mSH", "slug": "fabric-api" },
    "filename": { "prefix": ["fabric-api-"] }
  },
  "notes": "The Fabric mod loader's standard library. Removing it fails every Fabric mod."
}
```

Entries use the same `match` shape as rules, so consumers reuse one matcher implementation.

**Over-matching here is safe by design.** A broad prefix only protects extra files; it can never
cause a deletion. This is why `framework-` is acceptable as a bare prefix in `neverRemove` even
though it would be far too broad for a rule.

Currently protected: Fabric API, Fabric Language Kotlin, Architectury API, Cloth Config, Kotlin
for Forge, Forge Config API Port, Balm, Bookshelf, Collective, Puzzles Lib, Resourceful Lib,
Framework, MixinExtras, Sinytra Connector, Forgified Fabric API.

### `overrides`

Sideness occasionally depends on the loader and Minecraft version — a mod gains a server
component in a later release, or a specific pack ships a fork. `overrides` corrects a rule for a
narrow scope without forking the whole entry.

Keyed by `<loader>@<minecraftVersion>`, with `*` allowed in either position. Values map a rule
`id` to a partial rule.

```jsonc
"overrides": {
  // Distant Horizons only grew a server side in 2.x — on 1.20.1 packs pinned to DH 1.x
  // it really is client-only.
  "fabric@1.20.1": {
    "mr.distanthorizons": {
      "sideness": "client-only",
      "confidence": "high",
      "reason": "DH 1.x on this MC version has no server component"
    }
  },
  "forge@*": {
    "mr.xaeros-minimap": { "sideness": "client-optional", "confidence": "heuristic" }
  }
}
```

Resolution order: exact `loader@version` → `loader@*` → `*@version` → `*`. Later, more specific
matches win. Overrides are applied **after** rule matching and **before** `neverRemove`, which
still has the final word. An override naming an unknown rule `id` is ignored.

Keep this object small. If a correction is universally true, fix the rule instead.

---

## Consumer rules

Binding on **both** consumers (the panel cleaner and the in-container install script). These come
from the project's interface contract, §4:

1. `schemaVersion > 1` → refuse to strip anything, log, **fail open**.
2. Unknown `confidence` → treat as the lowest tier (never auto-select).
3. Unknown `sideness` → treat as `client-optional` (never auto-select).
4. Unknown `loaders` entry → no match.
5. Missing `neverRemove` → treat as empty **and log a warning**.
6. `neverRemove` is applied **last**, as a hard post-filter. Nothing overrides it.
7. List unreachable → strip nothing, report `listAvailable: false`. **Never guess.**

Two more that follow from how the data is built:

8. Only `mods/` is scanned. Shaderpacks (Complementary, BSL, …) live in `shaderpacks/` and
   resource packs in `resourcepacks/`; neither is in scope, and neither belongs in this list.
9. Nothing is ever deleted. Stripped jars move to `mods_disabled/` and can be restored.

---

## Contributing

### Adding an entry

1. **Determine sideness honestly.** In descending order of strength:
   - `https://api.modrinth.com/v2/project/<slug>` → `client_side` / `server_side`.
     `server_side: "unsupported"` is the strongest single signal available.
   - Open the jar and read `fabric.mod.json` → `"environment"`. `"client"` is conclusive;
     `"*"` or absent tells you almost nothing.
   - Check whether a server-side companion build exists (a `-paper-` artifact, or a separate
     "server component" project). If one does, the mod is `client-optional`.
   - Read the mod page for phrases like "install on both sides" or "server optional".

2. **Pick the tier conservatively.** If two signals disagree, you have `high` at best. If you are
   reasoning from the mod's category rather than from an observation, you have `heuristic`.

3. **Write the evidence down.** An entry without checkable evidence will not be merged. Include
   the endpoint you called and the values you saw, and set `checkedAt`.

4. **Set `loaders`** to the loaders the mod actually publishes for, restricted to
   `fabric`/`forge`/`neoforge`/`quilt`.

5. **Add filename matchers only from real filenames** you have seen on the project's files page.
   Do not guess a prefix — a wrong prefix is a silent mismatch at best and a wrong strip at worst.

6. **Bump `listVersion`** and `updatedAt`.

### Validating before you push

The file must be strict JSON, and the Worker will refuse to promote it if it is not. Check
locally:

```bash
python -m json.tool data/client-only.json > /dev/null && echo "valid JSON"
```

Every `filename.regex` must compile:

```bash
node -e '
const d = require("./data/client-only.json");
let n = 0;
for (const r of [...d.rules, ...(d.neverRemove ?? [])]) {
  const re = r.match?.filename?.regex;
  if (re) { new RegExp(re); n++; }
}
console.log(`${n} regex(es) compile`);
'
```

Sanity-check ids and required fields:

```bash
node -e '
const d = require("./data/client-only.json");
const ids = d.rules.map(r => r.id);
const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
if (dupes.length) throw new Error("duplicate ids: " + dupes);
for (const r of d.rules) {
  for (const f of ["id","name","sideness","confidence","loaders","reason","match","evidence","notes"])
    if (r[f] === undefined) throw new Error(`${r.id ?? "?"} missing ${f}`);
  if (!["client-only","client-optional"].includes(r.sideness)) throw new Error(r.id + " sideness");
  if (!["verified","high","heuristic"].includes(r.confidence)) throw new Error(r.id + " confidence");
  if (!r.loaders.length) throw new Error(r.id + " has no loaders");
  if (!r.evidence.length) throw new Error(r.id + " has no evidence");
}
console.log(`${d.rules.length} rules OK, ${d.neverRemove.length} protected`);
'
```

After merging to `main`, the webhook refreshes the cache within seconds. Confirm:

```bash
curl -s https://cloudflare-api.bytebuilders.co.za/cache/client-mods/health | jq '.listVersion, .ruleCount, .status'
```

If `listVersion` has not moved after a minute, the push either did not touch
`data/client-only.json` or the file failed validation — check `lastUpstreamError` in the same
response. Cron re-checks every five minutes regardless.

### Changing an existing entry

Loosening an entry (`client-optional` → `client-only`, or raising confidence) needs **new
evidence** in the `evidence` array, not just an opinion. Tightening an entry (`client-only` →
`client-optional`, or lowering confidence) is always acceptable and can be merged on a credible
bug report — the failure it prevents is much more expensive than the one it causes.

Never reuse an `id` for a different mod. Retire it and add a new one.
