/**
 * Every error shape that has actually reached the import dialog.
 *
 * Written after a rejected credentials import showed `[object Object]` as its
 * reason twice: the generated client interpolates the response body into the
 * `message`, which destroys it, so a plausible-looking message must never win
 * over the payload still sitting on `body`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { describeError } from '../src/describeError.ts'

const FALLBACK = 'The server rejected this without saying why.'

test('describeError reads the shapes clients actually throw', () => {
  assert.equal(describeError('boom'), 'boom')
  assert.equal(describeError(new Error('nope')), 'nope')
  assert.equal(describeError({ detail: 'Chain not found' }), 'Chain not found')

  const wrapped: any = new Error('x')
  wrapped.message = { detail: 'Chain not found' }
  assert.equal(describeError(wrapped), 'Chain not found')

  // pydantic 422 — name the field, or the message says nothing about which cell
  assert.equal(
    describeError({ body: { detail: [{ loc: ['body', 0, 'domain'], msg: 'value is not a valid enumeration member' }] } }),
    'domain: value is not a valid enumeration member',
  )

  const many = { detail: Array.from({ length: 5 }, (_, i) => ({ loc: ['body', i, 'x'], msg: `m${i}` })) }
  assert.equal(describeError(many), 'x: m0; x: m1; x: m2 (and 2 more)')

  assert.equal(describeError({ response: { data: { detail: 'Chain not found' } } }), 'Chain not found')

  const cyclic: any = {}
  cyclic.body = cyclic
  assert.equal(describeError(cyclic), FALLBACK)
  assert.equal(describeError(undefined), FALLBACK)
})

test('a useless message never beats the real payload', () => {
  const e: any = new Error('[object Object]')
  e.body = { detail: [{ loc: ['body', 0, 'platforms'], msg: 'value is not a valid list' }] }
  assert.equal(describeError(e), 'platforms: value is not a valid list')

  assert.equal(describeError({ message: 'Request failed: [object Object]', status: 422 }), 'The server answered 422.')
  assert.equal(describeError(new Error('[object Object]')), FALLBACK)
})
