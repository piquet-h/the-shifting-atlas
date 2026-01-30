# Design Document: Geospatial & Hydrology Modeling

> STATUS: FUTURE / NOT IMPLEMENTED (2025-10-02). No spatial tiling, elevation, river, lake, coastline, or region hierarchy code exists yet. This document captures forward design so early choices in traversal / lore / AI prompting remain compatible with a globe‑scale world model.
>
> Related: [Navigation & Traversal](navigation-and-traversal.md) · [World Rules & Lore](world-rules-and-lore.md) · [AI Prompt Engineering](ai-prompt-engineering.md)

## Summary

Provides a deterministic, multi‑scale spatial layer (tiles → subtiles → locations) plus hydrological graph (water bodies + river segments) that augments the existing location / exit model. It enables:

- Consistent outdoor generation (biomes, altitude, proximity to water)
- Hierarchical aggregation (regional summaries, watershed events)
- Lazy materialization (only persist fine detail if explored)
- Prompt scaffolding via structured facts (avoid lore drift)
- Future globe expansion without rewriting early data

## Scope (In) / (Out)

In (foundation phases):

- Spatial tiling scheme (lat, lon, optional altitude) → stable `spatialKey`
- Region hierarchy (Region level 0..N) & containment edges
- Hydrology primitives: `WaterBody` (lake/sea/ocean zone), `RiverSegment`
- Deterministic seeding + hashing utilities (seed → reproducible noise fields)
- Structured prompt fact block (biome, elevation, hydrology context)
- Telemetry events for materialization and cache hits

Out (defer):

- Dynamic erosion / sediment simulation
- Sea level change events
- Ocean currents & tides
- Watershed economic modifiers
- Underwater traversal rules (links to future traversal extensions)

## Design Pillars

1. Deterministic Seeds: `seed = SHA256(worldSeed + ':' + spatialKey + ':' + layerKind)`
2. Hierarchical Graph: Regions contain Locations & hydrology features; rivers flow acyclically.
3. Separation of Concerns: Navigation manages movement edges; this module supplies context (elevation, moisture, proximity to water) but does not add player movement logic.
4. Sparse Persistence: Generate summaries (Region, major rivers) eagerly; lazily generate Location‑adjacent fine segments.
5. Prompt Minimalism: Provide structured facts only—no large prose dumps.

## Core Vertex Types (Planned)

| Type           | Purpose                                       | Notes                                   |
| -------------- | --------------------------------------------- | --------------------------------------- |
| `Region`       | Spatial aggregation / biome + climate summary | Hierarchical (`subregion_of`)           |
| `WaterBody`    | Lake, sea, ocean zone, marsh                  | May reference polygon / cell list       |
| `RiverSegment` | Directed flow unit between confluences        | Maintains Strahler order                |
| `Location`     | (Existing) Traversable node                   | Gains spatial + hydrology context props |

Additional (later): `Watershed`, `TerrainFeature` (mountain peak, glacier), `OceanCurrent`.

## Core Edge Types (Planned)

| Edge           | Direction                                  | Purpose                  |
| -------------- | ------------------------------------------ | ------------------------ | ---------------------- | -------------------- |
| `contains`     | Region → (Location                         | WaterBody                | RiverSegment)          | Hierarchy membership |
| `subregion_of` | Region(child) → Region(parent)             | Multi‑scale linking      |
| `flows_into`   | RiverSegment → (RiverSegment               | WaterBody)               | Directed hydrology DAG |
| `drains_into`  | WaterBody → WaterBody                      | Lake/sea/ocean drainage  |
| `coastal_of`   | Location → WaterBody                       | Shoreline classification |
| `adjacent`     | Region ↔ Region or WaterBody ↔ WaterBody | Spatial neighbors        |

## Key Properties (Conceptual Schemas)

Location (additions):

- `lat`, `lon`, `altMeters` (double; alt negative below sea level)
- `biomeCode` (enum string)
- `moistureIndex` (0–1)
- `temperatureBand` (categorical)
- `regionId` (GUID)
- `hydrologyContext`: `{ nearestWaterBodyId?, riverSegmentId?, distanceMeters?, riverOrder? }`
- `spatialKey` (canonical tile/subtile key)

WaterBody:

- `id`, `type` (`lake|sea|ocean_zone|marsh|reservoir`)
- `surfaceElevation`
- `avgDepthMeters?`
- `salinity` (`fresh|brackish|saline`)
- `boundingCells` (array of spatialKeys OR polygon ref)
- `inflowRiverIds[]`, `outflowRiverIds[]`
- `proceduralSeed`

RiverSegment:

- `id`
- `path` (compressed polyline or ordered coord list)
- `lengthMeters`
- `order` (Strahler)
- `dischargeEstimate`
- `upstreamIds[]`, `downstreamId?`
- `sourceType`, `mouthType`
- `proceduralSeed`

Region:

- `id`, `level` (0=global,1=macro,2=tile,3=subtile)
- `bounds` (cell keys / bbox)
- `dominantBiome`
- `elevationStats` (min/max/mean)
- `hydrologySummary` (river counts by order, water body refs)
- `proceduralSeed`

## Tiling Strategy

Initial: Latitude/Longitude bucketed grid (Δ ≈ 0.25°) → simple hashing. Provide abstraction so a later switch to geodesic (S2 / icosahedral) cells only impacts the tiling module.

Spatial Key Format (example):
`T:<latBucket>:<lonBucket>` (top level) → optional sub‑cell: `S:<latExact>:<lonExact>` → hashed GUID for persistence but original components stored for reversibility.

Normalization Rules:

- lon normalized to [-180, 180)
- lat precision clamped (e.g. 1e‑6) before hashing
- altitude truncated to cm precision to prevent RNG seed churn

## Deterministic Generation Pipeline (Lazy)

1. Elevation Field: Noise + tectonic heuristics seeded per region.
2. Flow Direction: Derive downslope direction grid.
3. Flow Accumulation: Thresholds → river source candidates.
4. Segment Extraction: Trace paths, simplify to polylines.
5. Lake Detection: Closed depressions or unresolved sinks become WaterBodies.
6. Ocean Zoning: Partition ocean cells into coarse zones for adjacency + events.
7. Persistence: Store only regions + high‑order rivers initially; finer segments created on demand near explored locations.

Each step pure (input seed → output). Memoize intermediate artifacts per region for reuse.

## Prompt Fact Block (Example)

```
biome: temperate_forest
lat: 34.125N
lon: 117.875W
altitude_m: 420
hydrology: near_river(order=3, distance_m=118, bearing_deg=95)
season: late_spring
climate_band: mild
canonical_features: [ferns, mossy_boulders]
```

AI instructions forbid invention of unlisted large water bodies or major elevation discontinuities.

## Telemetry (Planned Event Names)

(All added via central telemetry enum; no inline literals.)

- `WorldGen.RegionMaterialized` (spatialKey, level, durationMs, cacheHit)
- `WorldGen.RiverSegmentMaterialized` (order, lengthMeters, durationMs)
- `WorldGen.WaterBodyMaterialized` (type, areaCells, durationMs)
- `WorldGen.LocationHydrologyContextResolved` (distanceMeters, riverOrder, cacheHit)

## Phased Adoption

| Phase | Goal                                       | Deliverables                                      |
| ----- | ------------------------------------------ | ------------------------------------------------- |
| G1    | Deterministic seeding + spatial key utils  | Hash utility, tests, docs                         |
| G2    | Region vertices + basic biome stat gen     | Region CRUD + telemetry                           |
| G3    | High‑order river skeleton + lake detection | RiverSegment + WaterBody minimal schema           |
| G4    | Location context enrichment                | HydrologyContext resolver + prompt fact injection |
| G5    | Lazy fine river refinement                 | On‑demand segment subdivision near exploration    |
| G6    | Advanced hydrology (delta fans, marshes)   | New WaterBody subtypes + events                   |

## Interactions With Other Modules

- Navigation & Traversal: Supplies elevation/moisture modifiers for movement cost; does NOT own exit creation.
- World Rules & Lore: Biome transitions leverage Region stats; seasonal events may alter moisture or freeze state.
- AI Prompt Engineering: Uses structured fact block to ground descriptions; informs ambient snippet selection (tokenless layering model) and forbids hydrological invention beyond provided context.
- Economy & Trade: Future—river order & proximity feed trade route heuristics.
- Factions & Governance: Control zones can be tied to Region vertices (not individual segments) for macro influence.

## Open Questions

| Topic              | Question                             | Initial Direction                                 |
| ------------------ | ------------------------------------ | ------------------------------------------------- |
| Tiling Granularity | 0.25° too coarse for fine play?      | Start coarse; allow sub‑cell refinement on demand |
| Coordinate Storage | Store raw lat/lon on every Location? | Yes; minimal cost vs joins for analytics          |
| River Data Volume  | Will fine segments explode RU cost?  | Lazy + pruning of unreferenced low‑order segments |
| Lake Polygons      | Need full geometry early?            | No—store bounding cell list first                 |
| Sea Level Events   | Early dynamic simulation?            | Defer until stable traversal + hydrology base     |

## Risks & Mitigations

| Risk                                  | Mitigation                                                 |
| ------------------------------------- | ---------------------------------------------------------- |
| Hash instability from precision drift | Centralize normalization before hashing                    |
| River cycles (bad flow graph)         | DAG validation test harness (topological sort)             |
| Telemetry cardinality explosion       | Hash/bucket precise coordinates; store coarse bins         |
| Prompt hallucination                  | Strict fact block + post‑gen validator vs feature list     |
| Storage bloat                         | Lazy instantiation + TTL or pruning for untouched segments |

## Sequencing Guidance (Manual)

Hydrology work should follow establishment of basic persistent traversal. Early steps (G1–G2) can begin once Locations + Exits persistence is in place; no automated ordering system exists — apply engineering judgment.

## Minimal ADR Reference

A future ADR will formalize the tiling & hydrology approach (placeholder: `ADR-??-geospatial-hydrology-model`). This file hosts the living design; ADR captures the chosen tiling variant and invariants once locked.

## Non-Goals (Explicit)

- Full GIS accuracy or real‑earth projection fidelity
- High‑resolution climate simulation
- Realistic fluid dynamics; only abstracted flow ranking
- Player‑visible raw coordinates in prose (system only)

---

_Last updated: 2025-10-02 (initial creation)_
