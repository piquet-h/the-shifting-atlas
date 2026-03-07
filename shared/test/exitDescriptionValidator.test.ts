import assert from 'node:assert'
import test from 'node:test'
import { validateExitDescription, travelDurationMsToBucket, ExitDescriptionResponseSchema } from '../src/exitDescriptionValidator.js'

// ---------------------------------------------------------------------------
// EL-01: Length hard limit (max 120 chars)
// ---------------------------------------------------------------------------

test('EL-01: rejects text longer than 120 characters', () => {
    const text = 'A '.repeat(61) // 122 chars
    const result = validateExitDescription({ text, direction: 'north' })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-01')
})

test('EL-01: accepts text exactly 120 characters', () => {
    const text = 'A '.repeat(59) + 'x.' // 120 chars
    const result = validateExitDescription({ text, direction: 'north' })
    // EL-01 should pass (length check); may still fail later checks
    assert.notEqual(result.failingCheck?.checkId, 'EL-01')
})

// ---------------------------------------------------------------------------
// EL-02: Length minimum (min 15 chars)
// ---------------------------------------------------------------------------

test('EL-02: rejects text shorter than 15 characters', () => {
    const result = validateExitDescription({ text: 'A path.', direction: 'north' })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-02')
})

test('EL-02: accepts text exactly 15 characters', () => {
    const text = 'A path runs on.' // 15 chars
    assert.equal(text.length, 15)
    const result = validateExitDescription({ text, direction: 'north' })
    assert.notEqual(result.failingCheck?.checkId, 'EL-02')
})

// ---------------------------------------------------------------------------
// EL-03: Single sentence
// ---------------------------------------------------------------------------

test('EL-03: rejects text with multiple sentence-terminal punctuation marks', () => {
    const result = validateExitDescription({
        text: 'A path leads north. Another track heads east.',
        direction: 'north'
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-03')
})

test('EL-03: accepts single sentence with one terminal punctuation', () => {
    const result = validateExitDescription({
        text: 'A cobbled road continues north toward open ground.',
        direction: 'north'
    })
    assert.notEqual(result.failingCheck?.checkId, 'EL-03')
})

test('EL-03: accepts text with no terminal punctuation', () => {
    const result = validateExitDescription({
        text: 'A cobbled road continues north toward open ground',
        direction: 'north'
    })
    assert.notEqual(result.failingCheck?.checkId, 'EL-03')
})

// ---------------------------------------------------------------------------
// EL-04: No numeric duration
// ---------------------------------------------------------------------------

test('EL-04: rejects text with explicit minute duration', () => {
    const result = validateExitDescription({
        text: 'A path leads north, about 5 minutes away.',
        direction: 'north'
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-04')
})

test('EL-04: rejects text with hour duration', () => {
    const result = validateExitDescription({
        text: 'A road continues north, 2 hours distant.',
        direction: 'north'
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-04')
})

test('EL-04: rejects text with day duration', () => {
    const result = validateExitDescription({
        text: 'A track leads west, 3 days of travel ahead.',
        direction: 'west'
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-04')
})

test('EL-04: accepts text without numeric durations', () => {
    const result = validateExitDescription({
        text: 'A cobbled road continues north toward open ground.',
        direction: 'north'
    })
    assert.notEqual(result.failingCheck?.checkId, 'EL-04')
})

// ---------------------------------------------------------------------------
// EL-05: Direction mismatch — in/out with road language
// ---------------------------------------------------------------------------

test('EL-05: rejects road language for in direction', () => {
    const result = validateExitDescription({
        text: 'A road leads in through the gate.',
        direction: 'in'
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-05')
})

test('EL-05: rejects trail language for out direction', () => {
    const result = validateExitDescription({
        text: 'A trail leads out toward the hillside.',
        direction: 'out'
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-05')
})

test('EL-05: rejects walk language for in direction', () => {
    const result = validateExitDescription({
        text: 'A short walk leads in through the archway.',
        direction: 'in'
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-05')
})

test('EL-05: accepts threshold language for in direction', () => {
    const result = validateExitDescription({
        text: 'A low door opens into the building.',
        direction: 'in'
    })
    assert.notEqual(result.failingCheck?.checkId, 'EL-05')
})

test('EL-05: accepts threshold language for out direction', () => {
    const result = validateExitDescription({
        text: 'A doorway leads back outside.',
        direction: 'out'
    })
    assert.notEqual(result.failingCheck?.checkId, 'EL-05')
})

test('EL-05: does not apply to cardinal directions', () => {
    const result = validateExitDescription({
        text: 'A road heads north toward open ground.',
        direction: 'north'
    })
    assert.notEqual(result.failingCheck?.checkId, 'EL-05')
})

// ---------------------------------------------------------------------------
// EL-06: Vertical coherence — no climb/descend on level cardinal
// ---------------------------------------------------------------------------

test('EL-06: rejects climbing verb on north direction with no grade', () => {
    const result = validateExitDescription({
        text: 'The path climbs northward into the hills.',
        direction: 'north'
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-06')
})

test('EL-06: rejects descend verb on east direction with level grade', () => {
    const result = validateExitDescription({
        text: 'The track descends east toward the valley.',
        direction: 'east',
        grade: 'level'
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-06')
})

test('EL-06: accepts climbing verb on north direction with ascending grade', () => {
    const result = validateExitDescription({
        text: 'A worn track climbs northward into the hills.',
        direction: 'north',
        grade: 'ascending'
    })
    assert.notEqual(result.failingCheck?.checkId, 'EL-06')
})

test('EL-06: accepts descend verb on west direction with descending grade', () => {
    const result = validateExitDescription({
        text: 'The path descends steeply westward.',
        direction: 'west',
        grade: 'descending'
    })
    assert.notEqual(result.failingCheck?.checkId, 'EL-06')
})

test('EL-06: does not apply to up/down directions', () => {
    const result = validateExitDescription({
        text: 'A ladder ascends into the darkness above.',
        direction: 'up'
    })
    assert.notEqual(result.failingCheck?.checkId, 'EL-06')
})

test('EL-06: applies to diagonal directions without grade', () => {
    const result = validateExitDescription({
        text: 'A path climbs northeast toward the ridge.',
        direction: 'northeast'
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-06')
})

// ---------------------------------------------------------------------------
// EL-07: Canon creep — proper noun not in context
// ---------------------------------------------------------------------------

test('EL-07: rejects proper noun absent from context', () => {
    const result = validateExitDescription({
        text: 'A cobbled road continues north toward Millhaven.',
        direction: 'north'
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-07')
})

test('EL-07: accepts proper noun present in destinationName', () => {
    const result = validateExitDescription({
        text: 'A cobbled road continues north toward Millhaven.',
        direction: 'north',
        destinationName: 'Millhaven'
    })
    assert.notEqual(result.failingCheck?.checkId, 'EL-07')
})

test('EL-07: accepts multi-word destination name tokens', () => {
    const result = validateExitDescription({
        text: 'The lane runs east toward Old Mill Town.',
        direction: 'east',
        destinationName: 'Old Mill Town'
    })
    assert.notEqual(result.failingCheck?.checkId, 'EL-07')
})

test('EL-07: accepts proper noun in contextTokens', () => {
    const result = validateExitDescription({
        text: 'A path leads north past the Waystone.',
        direction: 'north',
        contextTokens: ['the Waystone']
    })
    assert.notEqual(result.failingCheck?.checkId, 'EL-07')
})

test('EL-07: allows direction keywords as title-case tokens', () => {
    const result = validateExitDescription({
        text: 'A narrow path leads North across the yard.',
        direction: 'north'
    })
    assert.notEqual(result.failingCheck?.checkId, 'EL-07')
})

test('EL-07: does not flag sentence-start word', () => {
    const result = validateExitDescription({
        text: 'The path leads north across the yard.',
        direction: 'north'
    })
    assert.notEqual(result.failingCheck?.checkId, 'EL-07')
})

// ---------------------------------------------------------------------------
// EL-08: No destination inference when destinationName is absent
// ---------------------------------------------------------------------------

test('EL-08: EL-07 fires first (fail-fast) when destinationName is absent and proper noun is found', () => {
    // EL-07 runs before EL-08; when a proper noun is absent from context AND destinationName
    // is absent, EL-07 is the first check to reject the text.
    const result = validateExitDescription({
        text: 'A narrow path leads toward Grimrock.',
        direction: 'north'
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-07')
})

test('EL-08: fires independently when proper noun is in contextTokens but destinationName is absent', () => {
    // EL-07 passes (token is in contextTokens), but EL-08 still fires because
    // destinationName is absent — the strict stub-destination rule applies.
    const result = validateExitDescription({
        text: 'A path leads toward Grimrock.',
        direction: 'north',
        contextTokens: ['Grimrock'] // EL-07 allowed, EL-08 still fires
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-08')
})

test('EL-08: does not apply when destinationName is provided', () => {
    const result = validateExitDescription({
        text: 'The lane runs east toward Grimrock.',
        direction: 'east',
        destinationName: 'Grimrock'
    })
    // EL-08 exempt because destinationName is provided; EL-07 also passes
    assert.notEqual(result.failingCheck?.checkId, 'EL-08')
})

test('EL-08: accepts fully generic text without proper nouns', () => {
    const result = validateExitDescription({
        text: 'A track continues east toward open ground.',
        direction: 'east'
    })
    assert.notEqual(result.failingCheck?.checkId, 'EL-08')
    assert.equal(result.valid, true)
})

// ---------------------------------------------------------------------------
// EL-09: Forbidden categories — weather / time-of-day
// ---------------------------------------------------------------------------

test('EL-09: rejects foggy weather term', () => {
    const result = validateExitDescription({
        text: 'A foggy lane winds north toward open ground.',
        direction: 'north'
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-09')
})

test('EL-09: rejects morning time-of-day term', () => {
    const result = validateExitDescription({
        text: 'A morning path leads north toward the fields.',
        direction: 'north'
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-09')
})

test('EL-09: rejects moonlit term', () => {
    const result = validateExitDescription({
        text: 'A moonlit track stretches west toward the hills.',
        direction: 'west'
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-09')
})

test('EL-09: rejects sunset term', () => {
    const result = validateExitDescription({
        text: 'A sunset road runs east.',
        direction: 'east'
    })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-09')
})

test('EL-09: accepts text with no weather or time-of-day terms', () => {
    const result = validateExitDescription({
        text: 'A cobbled road continues east toward open ground.',
        direction: 'east'
    })
    assert.notEqual(result.failingCheck?.checkId, 'EL-09')
})

// ---------------------------------------------------------------------------
// Happy path — full valid descriptions for each duration bucket
// ---------------------------------------------------------------------------

test('happy path: threshold bucket, in direction', () => {
    const result = validateExitDescription({
        text: 'A low door opens into the building.',
        direction: 'in'
    })
    assert.equal(result.valid, true)
    assert.equal(result.failingCheck, undefined)
})

test('happy path: near bucket, north direction', () => {
    const result = validateExitDescription({
        text: 'A narrow path leads north across the yard.',
        direction: 'north',
        durationBucket: 'near'
    })
    assert.equal(result.valid, true)
})

test('happy path: moderate bucket, east direction with road', () => {
    const result = validateExitDescription({
        text: 'A cobbled road continues east toward open ground.',
        direction: 'east',
        durationBucket: 'moderate'
    })
    assert.equal(result.valid, true)
})

test('happy path: far bucket, west direction with ascending grade', () => {
    const result = validateExitDescription({
        text: 'A worn track climbs westward into the hills.',
        direction: 'west',
        durationBucket: 'far',
        grade: 'ascending'
    })
    assert.equal(result.valid, true)
})

test('happy path: distant bucket, north direction, stub destination', () => {
    const result = validateExitDescription({
        text: 'The road disappears north into the distance.',
        direction: 'north',
        durationBucket: 'distant'
    })
    assert.equal(result.valid, true)
})

test('happy path: down direction with descending stair', () => {
    const result = validateExitDescription({
        text: 'A short ladder descends into the darkness below.',
        direction: 'down'
    })
    assert.equal(result.valid, true)
})

test('happy path: with named destination', () => {
    const result = validateExitDescription({
        text: 'A cobbled road leads south toward Thornfield.',
        direction: 'south',
        destinationName: 'Thornfield'
    })
    assert.equal(result.valid, true)
})

// ---------------------------------------------------------------------------
// Fail-fast ordering: EL-01 fires before EL-09
// ---------------------------------------------------------------------------

test('fail-fast: EL-01 fires before EL-09 when text is overlong AND has weather term', () => {
    const text = 'A foggy ' + 'x '.repeat(60) + 'lane.' // > 120 chars and contains 'foggy'
    const result = validateExitDescription({ text, direction: 'north' })
    assert.equal(result.valid, false)
    assert.equal(result.failingCheck?.checkId, 'EL-01')
})

// ---------------------------------------------------------------------------
// ExitDescriptionResponseSchema (Zod)
// ---------------------------------------------------------------------------

test('ExitDescriptionResponseSchema: valid response parses correctly', () => {
    const data = {
        forward: 'A cobbled road continues north toward open ground.',
        backward: 'The cobbled road runs south back into the square.'
    }
    const result = ExitDescriptionResponseSchema.safeParse(data)
    assert.ok(result.success)
    if (result.success) {
        assert.equal(result.data.forward, data.forward)
        assert.equal(result.data.backward, data.backward)
    }
})

test('ExitDescriptionResponseSchema: rejects missing backward field', () => {
    const data = { forward: 'A cobbled road continues north toward open ground.' }
    const result = ExitDescriptionResponseSchema.safeParse(data)
    assert.equal(result.success, false)
})

test('ExitDescriptionResponseSchema: rejects forward exceeding 120 chars', () => {
    const data = {
        forward: 'x'.repeat(121),
        backward: 'A cobbled road runs south.'
    }
    const result = ExitDescriptionResponseSchema.safeParse(data)
    assert.equal(result.success, false)
})

test('ExitDescriptionResponseSchema: rejects backward shorter than 15 chars', () => {
    const data = {
        forward: 'A cobbled road continues north toward open ground.',
        backward: 'Short.'
    }
    const result = ExitDescriptionResponseSchema.safeParse(data)
    assert.equal(result.success, false)
})

// ---------------------------------------------------------------------------
// travelDurationMsToBucket utility
// ---------------------------------------------------------------------------

test('travelDurationMsToBucket: undefined → moderate', () => {
    assert.equal(travelDurationMsToBucket(undefined), 'moderate')
})

test('travelDurationMsToBucket: 0 → threshold', () => {
    assert.equal(travelDurationMsToBucket(0), 'threshold')
})

test('travelDurationMsToBucket: 14999 → threshold', () => {
    assert.equal(travelDurationMsToBucket(14_999), 'threshold')
})

test('travelDurationMsToBucket: 15000 → near', () => {
    assert.equal(travelDurationMsToBucket(15_000), 'near')
})

test('travelDurationMsToBucket: 299999 → near', () => {
    assert.equal(travelDurationMsToBucket(299_999), 'near')
})

test('travelDurationMsToBucket: 300000 → moderate', () => {
    assert.equal(travelDurationMsToBucket(300_000), 'moderate')
})

test('travelDurationMsToBucket: 1799999 → moderate', () => {
    assert.equal(travelDurationMsToBucket(1_799_999), 'moderate')
})

test('travelDurationMsToBucket: 1800000 → far', () => {
    assert.equal(travelDurationMsToBucket(1_800_000), 'far')
})

test('travelDurationMsToBucket: 14399999 → far', () => {
    assert.equal(travelDurationMsToBucket(14_399_999), 'far')
})

test('travelDurationMsToBucket: 14400000 → distant', () => {
    assert.equal(travelDurationMsToBucket(14_400_000), 'distant')
})

test('travelDurationMsToBucket: very large value → distant', () => {
    assert.equal(travelDurationMsToBucket(Number.MAX_SAFE_INTEGER), 'distant')
})

test('travelDurationMsToBucket: 60000 → near (DEFAULT_TRAVEL_DURATION_MS)', () => {
    // DEFAULT_TRAVEL_DURATION_MS = 60_000 falls in the 'near' band
    assert.equal(travelDurationMsToBucket(60_000), 'near')
})
