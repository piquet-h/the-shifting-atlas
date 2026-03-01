# Interior Structure Naming & Tagging Conventions

Purpose: Define a deterministic naming scheme and tag vocabulary for modeling interiors (taverns, cottages, guest rooms, dungeons) as sub-locations without bloating the surface map. Enables coherent narration ("still in the tavern"), UI behaviours (map filter/collapse interiors), and consistent AI prompt context.

References:

- `backend/src/data/villageLocations.json` (seed data)
- `frontend/src/utils/mapSemantics.ts` (`isInteriorNode` helper)
- `eslint-rules/no-invalid-structure-tags.mjs` (enforcement rule)

---

## 1. Tag Vocabulary

Every location that belongs to a named structure carries **both** of the following tags:

| Tag                         | Format                          | Examples                                              |
| --------------------------- | ------------------------------- | ----------------------------------------------------- |
| `structure:<slug>`          | `structure:` + kebab-case slug  | `structure:lantern-and-ladle`, `structure:town-hall`  |
| `structureArea:<area>`      | `structureArea:` + area keyword | `structureArea:outside`, `structureArea:common-room`  |

### 1.1 Canonical `structureArea` Values

| Area keyword    | Meaning                                                      |
| --------------- | ------------------------------------------------------------ |
| `outside`       | Threshold / entrance node that connects surface to interior  |
| `common-room`   | Main public floor (tavern hall, inn lobby, shop floor)       |
| `hall`          | Corridor or connecting passage between areas                 |
| `guest-rooms`   | Landing / floor with multiple private rooms                  |
| `room:<n>`      | A specific numbered private room (e.g. `structureArea:room:3`) |
| `cellar`        | Below-ground storage or utility space                        |
| `upper-floor`   | Any upper storey that is not a specific room (landing/loft)  |
| `kitchen`       | Cooking and preparation area                                 |
| `stable`        | Animal housing / secondary outbuilding entrance              |

> **Extension rule**: any new area keyword must be added to this table and to the
> `CANONICAL_STRUCTURE_AREAS` constant in `eslint-rules/no-invalid-structure-tags.mjs` before use.

---

## 2. Location Naming Scheme

```
<Structure Name> — <Area Label>
```

Use an em-dash (`—`, U+2014) surrounded by spaces as the separator. The area label is the human-readable counterpart of the `structureArea` keyword.

| `structureArea` keyword | Area label in name  | Full example                                 |
| ----------------------- | ------------------- | -------------------------------------------- |
| `outside`               | *(omit; keep just the structure name for the threshold)* | `The Lantern & Ladle` |
| `common-room`           | Common Room         | `The Lantern & Ladle — Common Room`          |
| `hall`                  | Hall                | `The Lantern & Ladle — Hall`                 |
| `guest-rooms`           | Guest Rooms         | `The Lantern & Ladle — Guest Rooms`          |
| `room:<n>`              | Room \<n\>          | `The Lantern & Ladle — Room 3`               |
| `cellar`                | Cellar              | `The Lantern & Ladle — Cellar`               |
| `upper-floor`           | Upper Floor         | `The Lantern & Ladle — Upper Floor`          |
| `kitchen`               | Kitchen             | `The Lantern & Ladle — Kitchen`              |
| `stable`                | Stable              | `The Lantern & Ladle — Stable`               |

> The `outside` threshold node is the surface-visible entry point. Its name is the structure name alone so the surface map label stays clean.

---

## 3. Direction Semantics Indoors

| Transition                            | Required direction | Example                                      |
| ------------------------------------- | ------------------ | -------------------------------------------- |
| Surface → threshold (entering)        | `in`               | Market Square → The Lantern & Ladle          |
| Threshold → surface (leaving)         | `out`              | The Lantern & Ladle → Market Square          |
| Ground floor → upper floor            | `up`               | Common Room → Upper Floor                    |
| Upper floor → ground floor            | `down`             | Upper Floor → Common Room                    |
| Ground floor → cellar                 | `down`             | Common Room → Cellar                         |
| Cellar → ground floor                 | `up`               | Cellar → Common Room                         |
| Threshold → main room                 | `in`               | The Lantern & Ladle → Common Room            |
| Main room → threshold                 | `out`              | Common Room → The Lantern & Ladle            |
| Room to room along a corridor         | cardinal (optional)| Common Room → Hall (north), Hall → Kitchen (west) |

**Rules**:

1. `in` / `out` are the canonical directions for threshold crossings. They drive the WorldMap "Interior" filter.
2. `up` / `down` handle vertical movement between floors. They drive the WorldMap "Vertical" filter.
3. Cardinals (`north`, `south`, `east`, `west`) may be used for lateral movement along a corridor but are optional. Prefer them only when spatial orientation aids narration.
4. A single location **must not** mix threshold semantics (`in`/`out`) and cardinal semantics for the **same** connection (i.e., do not create both an `in` exit and a `north` exit that lead to the same destination).

---

## 4. Identifying Interior Nodes for Map Filtering

### 4.1 Tag-Based (Preferred)

A location is considered **inside a structure** when its `tags` array contains **any** entry matching the pattern `structure:<slug>` AND the `structureArea:<area>` is not `outside`.

```typescript
// frontend/src/utils/mapSemantics.ts
export function isInteriorNode(tags: string[] | undefined): boolean {
    if (!tags) return false
    const hasStructureTag = tags.some((t) => /^structure:[a-z0-9-]+$/.test(t))
    const hasOutsideArea = tags.some((t) => t === 'structureArea:outside')
    return hasStructureTag && !hasOutsideArea
}
```

The `outside` threshold node is **not** hidden by the interior filter — it is the entry point visible on the surface map.

### 4.2 Edge-Kind Heuristic (Acceptable Fallback)

When tags are absent (e.g. legacy or AI-generated locations), a node is inferred as interior if it is **only reachable via `in`/`out` edges** and has no cardinal exits connecting it to the wider graph. This is implemented in `mapDrill.ts` via edge kind propagation; do not rely on this for new authored locations.

### 4.3 Map Filter Behaviour

| Filter toggle       | Hides                                                          |
| ------------------- | -------------------------------------------------------------- |
| Interior (off)      | Nodes tagged `structure:<slug>` with `structureArea` ≠ `outside`; `in`/`out` edges |
| Vertical (off)      | `up`/`down` edges and nodes only reachable via those edges     |
| Surface (off)       | All cardinal-only nodes (removes surface map)                  |

The threshold node (`structureArea:outside`) remains visible when "Interior" is off so the surface map retains the building's footprint.

---

## 5. Edge Cases

### 5.1 Location That Is Both a Surface Hub and an Interior

**Avoid** this pattern. If a building's entrance is also a meaningful surface junction (e.g. a gate with an attached guardhouse), **split** it:

```
[Market Square]  --north-->  [North Gate]  --in-->  [North Gate — Guardhouse]
                                              ^
                                  surface node, no `structure:` tag
```

`North Gate` stays on the surface map with no `structure:` tag. `North Gate — Guardhouse` carries `structure:north-gate` + `structureArea:common-room`.

### 5.2 Multi-Entrance Structures (Front Door + Stable Door)

Use **two threshold nodes**, both tagged `structureArea:outside`, both sharing the same `structure:<slug>`:

```
[Village Square]  --in-->  [The Lantern & Ladle]           tags: structure:lantern-and-ladle, structureArea:outside
[Stable Yard]     --in-->  [The Lantern & Ladle — Stable]  tags: structure:lantern-and-ladle, structureArea:stable
```

Both threshold nodes connect inward to the same `common-room` (or whichever floor they open onto). Navigation and narration can reference the parent `structure:` slug to confirm "you're still inside".

---

## 6. Seed Data Example

```json
{
  "id": "...",
  "name": "The Lantern & Ladle",
  "description": "A low-beamed inn entrance. The smell of wood smoke and stewed mutton drifts from inside.",
  "tags": ["settlement:mosswell", "structure:lantern-and-ladle", "structureArea:outside"],
  "exits": [
    { "direction": "out", "to": "<village-square-id>", "description": "Back to the square." },
    { "direction": "in",  "to": "<common-room-id>",    "description": "Push through the heavy door." }
  ]
},
{
  "id": "...",
  "name": "The Lantern & Ladle — Common Room",
  "description": "Rough-hewn tables fill a smoky room lit by tallow candles. The barkeep ignores you.",
  "tags": ["settlement:mosswell", "structure:lantern-and-ladle", "structureArea:common-room"],
  "exits": [
    { "direction": "out", "to": "<threshold-id>",  "description": "The front door." },
    { "direction": "up",  "to": "<guest-rooms-id>","description": "A creaking staircase." }
  ]
}
```

---

## 7. Enforcement

The lint rule `internal/no-invalid-structure-tags` (in `eslint-rules/no-invalid-structure-tags.mjs`) validates:

1. `structure:<slug>` — slug must be kebab-case: each segment separated by a hyphen must contain at least one alphanumeric character (`[a-z0-9]+(-[a-z0-9]+)*`). Leading/trailing hyphens and consecutive hyphens are forbidden.
2. `structureArea:<area>` — area must be one of the canonical keywords in § 1.1 (including the `room:<n>` pattern).
3. Co-presence: if either tag is present in a TypeScript string array literal, both must be present.

Run `npm run lint` in the `backend/` directory to validate seed-data construction and location upsert call sites.

---

Last reviewed: 2026-03-01
