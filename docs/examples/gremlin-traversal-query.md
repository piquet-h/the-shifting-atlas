# Example: Gremlin Traversal Query (Finding Exits)

Practical example of querying Cosmos DB Gremlin API to retrieve exits from a location.

---

## Purpose

Demonstrate basic Gremlin traversal patterns for spatial navigation queries. This example shows how to find all exits from a given location vertex.

---

## Code Location

**Graph service**: `backend/src/services/graph/` (future implementation)
**Data model**: `shared/src/models/` (location, exit definitions)

---

## Gremlin Query Pattern

### Finding All Exits from a Location

```gremlin
g.V('location-guid')
  .outE('exit_north', 'exit_south', 'exit_east', 'exit_west', 'exit_up', 'exit_down', 'exit_in', 'exit_out')
  .project('direction', 'targetId', 'targetName')
    .by(label)
    .by(inV().id())
    .by(inV().values('name'))
```

**Explanation**:

1. `g.V('location-guid')` - Start at source location vertex
2. `.outE(...)` - Traverse outgoing edges (exits) with direction labels
3. `.project(...)` - Shape results into structured objects
4. `.by(label)` - Extract edge label (e.g., `exit_north`)
5. `.by(inV().id())` - Get target location ID
6. `.by(inV().values('name'))` - Get target location name

---

## Expected Response Structure

```json
[
    {
        "direction": "exit_north",
        "targetId": "target-location-guid-1",
        "targetName": "Village Square"
    },
    {
        "direction": "exit_east",
        "targetId": "target-location-guid-2",
        "targetName": "Market District"
    }
]
```

---

## TypeScript Integration (Future)

```typescript
import { gremlinClient } from '../clients/gremlin.js'

async function getExitsFromLocation(locationId: string) {
    const query = `
        g.V('${locationId}')
          .outE('exit_north', 'exit_south', 'exit_east', 'exit_west', 
                'exit_up', 'exit_down', 'exit_in', 'exit_out')
          .project('direction', 'targetId', 'targetName')
            .by(label)
            .by(inV().id())
            .by(inV().values('name'))
    `

    const result = await gremlinClient.submit(query)
    return result.toArray()
}
```

---

## Security Note: Parameterized Queries

**⚠️ Do NOT interpolate user input directly into Gremlin strings!**

Use parameter binding when supported by your Gremlin client:

```typescript
// Safer pattern (if client supports parameters)
const query = `
    g.V(locationId)
      .outE('exit_north', 'exit_south', 'exit_east', 'exit_west')
      .project('direction', 'targetId', 'targetName')
        .by(label)
        .by(inV().id())
        .by(inV().values('name'))
`

const bindings = { locationId: userProvidedId }
const result = await gremlinClient.submit(query, bindings)
```

---

## Common Gremlin Patterns

### 1. Check if Vertex Exists

```gremlin
g.V('location-guid').count()
```

Returns: `1` if exists, `0` if not

### 2. Add a New Location Vertex

```gremlin
g.addV('Location')
  .property('id', 'new-location-guid')
  .property('name', 'Enchanted Forest')
  .property('description', 'A mystical woodland shrouded in mist.')
  .property('partitionKey', 'default')
```

### 3. Add an Exit Edge (Reciprocal)

```gremlin
g.V('location-a').addE('exit_north').to(V('location-b'))
g.V('location-b').addE('exit_south').to(V('location-a'))
```

### 4. Find Player's Current Location

```gremlin
g.V('player-guid').out('located_at').values('name')
```

---

## Performance Considerations

### Partition Key Strategy

Per ADR-002, the initial implementation uses a single logical partition (`partitionKey: 'default'`). As RU/latency telemetry grows:

- Monitor with `RU.Gremlin.Query` telemetry events
- Consider sharding by region/continent when thresholds exceeded

### Query Optimization

- **Use indexed properties**: `id`, `name`, `partitionKey`
- **Limit traversal depth**: Avoid unbounded `.repeat()` steps
- **Project only needed fields**: Use `.project()` to reduce payload size

---

## Testing Locally (Future)

When Cosmos DB integration is complete:

```bash
# Set environment variables
export PERSISTENCE_MODE=cosmos
export COSMOS_GREMLIN_ENDPOINT="wss://your-cosmos.gremlin.cosmos.azure.com:443/"
export COSMOS_GREMLIN_DATABASE="game"
export COSMOS_GREMLIN_GRAPH="world"

# Run backend
cd backend
npm start

# Test exit query endpoint
curl http://localhost:7071/api/location/{locationId}/exits
```

---

## Related Examples

- [Example: Azure Function Endpoint](./function-endpoint-player.md)
- [Example: Seed Script Usage](./seed-script-usage.md)

---

## Related Documentation

| Topic                    | Document                                        |
| ------------------------ | ----------------------------------------------- |
| Graph Partition Strategy | `../adr/ADR-002-graph-partition-strategy.md`    |
| Exit Invariants          | `../concept/exits.md`                           |
| Navigation Module        | `../design-modules/navigation-and-traversal.md` |
| Direction Normalization  | `../concept/direction-resolution-rules.md`      |

---

## Additional Resources

- [Gremlin Query Language Documentation](https://tinkerpop.apache.org/docs/current/reference/#graph-traversal-steps)
- [Azure Cosmos DB Gremlin API](https://learn.microsoft.com/en-us/azure/cosmos-db/gremlin/introduction)

---

_Last updated: 2025-11-07 (initial creation for MECE documentation hierarchy)_
