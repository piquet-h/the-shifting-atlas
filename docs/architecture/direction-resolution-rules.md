<!-- Relocated: This architecture doc has been superseded by concept facet invariants. -->

# Direction Resolution Rules (Relocated)

> This detailed normalization logic has moved to: `../concept/direction-resolution-rules.md`.
> Architecture facet now links to concept invariants instead of duplicating algorithm steps.

The architecture layer only needs to know:

1. Normalization returns one of three statuses: `ok`, `ambiguous`, `unknown`.
2. Only canonical directions are persisted on EXIT edges (see concept doc for list).
3. Relative directions (`left`, `right`, `forward`, `back`) require last heading; absence → `ambiguous`.
4. Typo tolerance is edit distance ≤ 1; multiple matches → treated as `unknown`.
5. Movement handlers must surface clarification messages verbatim from the normalizer result.

For full rationale, pipeline stages, and future roadmap items, see the concept authoritative source.

## References

- Concept: `../concept/direction-resolution-rules.md`
- Developer Usage Guide: `../developer-workflow/direction-normalizer-usage.md`
- Navigation Roadmap: `../modules/navigation-and-traversal.md`

---

_This stub prevents duplication per Facet Segregation Policy (Section 18)._
