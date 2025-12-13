# Realm Hierarchy Architecture

Purpose: Define a unified graph-based model for geographic, political, functional, and narrative realms that provide contextual grouping for atomic locations. This enables consistent regional weather, rich AI context, and scalable world organization.

---

## Concepts

- Location: Atomic point in the world (existing). Remains a Gremlin vertex with exits forming topology.
- Realm: New Gremlin vertex type representing any spatial or conceptual grouping. A location may belong to multiple realms simultaneously.

### Realm Vertex

Label: `realm`

Properties (minimum):

- id: GUID
- name: string
- realmType: RealmType (enum)
- scope: RealmScope (enum)
- description?: string
- narrativeTags?: string[]
- properties?: object (optional domain-specific attributes; e.g., climate, government, culturalTraits)

RealmType (initial set):

- WORLD, CONTINENT, MOUNTAIN_RANGE, FOREST, DESERT, OCEAN
- KINGDOM, DUCHY, COUNTY, CITY_STATE
- METROPOLIS, CITY, TOWN, VILLAGE, DISTRICT, QUARTER, STREET
- WEATHER_ZONE
- TRADE_NETWORK, ALLIANCE, CULTURAL_REGION, MILITARY_COMMAND
- DUNGEON, RUINS, SACRED_SITE

RealmScope:

- GLOBAL, CONTINENTAL, MACRO, REGIONAL, LOCAL, MICRO

### Edges

- within (containment hierarchy): Location → Realm, Realm → Realm
- member_of (overlapping classification): Location → Realm, Realm → Realm
- borders (adjacency): Realm ↔ Realm
- on_route (infrastructure): Location → Location (routeName)
- vassal_of, allied_with, at_war_with (political): Realm → Realm

Constraints:

- `within` edges form a DAG (no cycles). Multi-parent allowed only if explicitly designed; default is single parent for strict tree per hierarchy.

---

## Query Patterns

Ancestors for a location:

```
g.V(<locationId>).repeat(out('within').simplePath()).emit()
```

Find weather zone for a location:

```
g.V(<locationId>)
 .repeat(out('within').simplePath()).emit()
 .hasLabel('realm').has('realmType','WEATHER_ZONE').limit(1)
```

Locations in a realm:

```
g.V(<realmId>).repeat(in('within')).emit(hasLabel('location')).dedup()
```

---

## Description Layers Integration (SQL)

Description layers target either a specific location or a realm. This supports zone-based weather and other regional overlays.

- Container: `descriptionLayers` (SQL API)
- Partition key: `/scopeId`
- Scope patterns: `loc:<locationId>` or `realm:<realmId>`
- Common fields: `layerType`, `effectiveFromTick`, `effectiveToTick`, `value`, `metadata?`

Resolution priority when rendering a layer for a location at tick T:

1. Location-specific (`loc:<locationId>`)
2. Containing weather zone (`realm:<zoneId>`, realmType=WEATHER_ZONE)
3. Broader containing realms ordered by RealmScope (LOCAL → REGIONAL → MACRO → CONTINENTAL → GLOBAL)

---

## MVP Scope (M3c)

1. Add `realm` vertex + enums (schema only)
2. Add `within` edges for Weather Zones and attach relevant locations
3. Migrate `descriptionLayers` to `/scopeId` and implement realm scope resolution

Deferred (M5+): Geographic & Administrative hierarchies (continents, kingdoms, cities)

Deferred (M6+): Conceptual realms (trade networks, alliances, cultural regions)

---

## Related Documents

- Design Module overview: `../design-modules/README.md` (World Structure module)
- Temporal framework: `../modules/world-time-temporal-reconciliation.md`
- SQL containers: `./cosmos-sql-containers.md`

Last updated: 2025-12-13
