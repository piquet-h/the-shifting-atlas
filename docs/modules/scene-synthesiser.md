# Scene Synthesiser

## Purpose

The **Scene Synthesiser** turns deterministic description _signals_ (base text, hero-prose, weather/ambient overlays, tags, and provenance) into a single immersive, player-facing **scene**.

This is explicitly a **post-composition** step:

- `DescriptionComposer` remains deterministic and multiplayer-safe.
- Scene synthesis is an optional enrichment layer that may use an LLM.

## Latency contract (snappy vs cinematic)

Not all player requests should pay the same latency cost.

- **Action intents** should feel responsive by default (**snappy**): do not synchronously block on scene generation.
- **Narrative intents** may take longer (**cinematic**) when the user asks for it.

The **request chooses** the contract (explicit keywords/toggle), and handlers honor it consistently.

A practical contract set is:

- `snappy`: return immediately with deterministic output; scene may be absent.
- `cinematic`: cache-first; bounded wait; deterministic fallback on timeout/failure.
- `background`: return deterministic output immediately and generate scene asynchronously.

## Deterministic fallback and caching

When scene synthesis is enabled:

- **Cache-first**: shared scenes should be cached by location/context/tick bucket + input hash.
- **Multiplayer-safe**: cache keys for shared scenes must not include player-private data.
- **Fallback**: if generation fails or times out, return deterministic compiled output and mark fallback provenance.

## Non-goals

- Personalisation (player-private inputs + private caches)
- Streaming partial narrative
- Full semantic intent parsing beyond the latency contract
