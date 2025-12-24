import assert from 'node:assert'
import test from 'node:test'
import { REALM_EDGE_LABELS, isRealmEdgeLabel, type RouteEdge, type RealmEdgeLabel } from '../src/domainModels.js'

test('REALM_EDGE_LABELS contains all required edge labels', () => {
    const requiredLabels: RealmEdgeLabel[] = ['within', 'member_of', 'borders', 'on_route', 'vassal_of', 'allied_with', 'at_war_with']

    for (const label of requiredLabels) {
        assert.ok(REALM_EDGE_LABELS.includes(label), `REALM_EDGE_LABELS should include ${label}`)
    }
})

test('isRealmEdgeLabel validates valid edge labels', () => {
    assert.ok(isRealmEdgeLabel('within'))
    assert.ok(isRealmEdgeLabel('member_of'))
    assert.ok(isRealmEdgeLabel('borders'))
    assert.ok(isRealmEdgeLabel('on_route'))
    assert.ok(isRealmEdgeLabel('vassal_of'))
    assert.ok(isRealmEdgeLabel('allied_with'))
    assert.ok(isRealmEdgeLabel('at_war_with'))
})

test('isRealmEdgeLabel rejects invalid edge labels', () => {
    assert.equal(isRealmEdgeLabel('INVALID'), false)
    assert.equal(isRealmEdgeLabel('exit'), false) // location edge, not realm edge
    assert.equal(isRealmEdgeLabel(''), false)
    assert.equal(isRealmEdgeLabel('WITHIN'), false) // uppercase should not match
})

test('RouteEdge can be created with routeName property', () => {
    const routeEdge: RouteEdge = {
        routeName: "The King's Road"
    }

    assert.equal(routeEdge.routeName, "The King's Road")
})

test('RouteEdge routeName is required', () => {
    // TypeScript compile-time check - this test validates the type system
    // @ts-expect-error - routeName is required
    const invalidEdge: RouteEdge = {}

    // Runtime validation would happen in Gremlin helpers
    assert.ok(invalidEdge !== undefined)
})

test('RouteEdge with empty routeName is structurally valid but semantically questionable', () => {
    const edge: RouteEdge = {
        routeName: ''
    }

    // Structurally valid (TypeScript allows it)
    assert.equal(edge.routeName, '')

    // Semantic validation should happen in repository layer
})

test('RouteEdge with long route name', () => {
    const longName = 'The Ancient Trade Route from the Northern Mountains to the Southern Seaport'
    const edge: RouteEdge = {
        routeName: longName
    }

    assert.equal(edge.routeName, longName)
})

test('RouteEdge routeName can contain special characters', () => {
    const edge: RouteEdge = {
        routeName: "The Dragon's Path (Dangerous!)"
    }

    assert.equal(edge.routeName, "The Dragon's Path (Dangerous!)")
})
