/**
 * The import session's two load-bearing behaviours:
 *
 *   1. The first validation pass fires on load. No click. The design handoff
 *      loads rows unvalidated and waits to be asked; we do not.
 *   2. The hook survives a caller that rebuilds `optionCtx` on every render.
 *      Several mounts build their config inline, and keying the option fetch on
 *      that object spun the component forever — the render guard below is what
 *      caught it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' })
;(globalThis as any).window = dom.window
;(globalThis as any).document = dom.window.document
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true })
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const React = (await import('react')).default
const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { useImportSession, GRID_RENDER_CAP } = await import('../src/useImportSession.ts')
const { STARTER_TEMPLATE, defineImportTemplate, extendImportTemplate } = await import('../src/templates.ts')

const STORES = extendImportTemplate(STARTER_TEMPLATE, {
  key: 'stores',
  label: 'Stores',
  upsertKey: ['id'],
  removeColumns: ['email'],
  addColumns: [
    { key: 'id', type: 'number', label: 'Store id' },
    { key: 'address', type: 'text', label: 'Address', required: true },
  ],
  existenceRules: [
    { code: 'store_exists', column: 'name', unlessPresent: 'id', list: 'stores', message: 'A store with this name already exists.' },
  ],
})

const SUBSCRIPTIONS = defineImportTemplate({
  key: 'subscriptions',
  label: 'Subscriptions',
  upsertKey: ['email'],
  columns: [
    { key: 'email', type: 'ref', label: 'Email', required: true, list: 'people' },
    { key: 'topics', type: 'ref_list', label: 'Topics', multi: true, list: 'topics' },
  ],
})

const CSV = 'id,name,address\n,Corner Shop,1 Main St\n,,2 Main St\n'

test('first pass runs on load; later edits wait for the next check', async () => {
  let fetches = 0
  const loadOptions = async () => {
    fetches++
    return { options: [] }
  }

  let renders = 0
  function Harness() {
    renders++
    if (renders > 200) throw new Error(`render loop: ${renders} renders`)
    const s = useImportSession({
      template: STORES,
      optionCtx: { tenant: 't', loadOptions },
      apply: async () => [],
      onClose: () => {},
    })
    ;(globalThis as any).__s = s
    return null
  }

  const root = createRoot(document.getElementById('root')!)
  await act(async () => { root.render(React.createElement(Harness)) })

  // Drop a file. Nothing else is clicked.
  await act(async () => { (globalThis as any).__s.loadText(CSV, 'stores.csv') })
  await act(async () => { await new Promise((r) => setTimeout(r, 450)) })

  const s = (globalThis as any).__s
  assert.equal(s.phase, 'review', 'lands on review')
  assert.equal(s.check, 'done', 'checked without a click')
  assert.equal(s.rows.length, 2)
  assert.equal(s.summary.problems, 1, 'the blank row is flagged')
  assert.ok(s.rows[1].problems.name, 'missing name is on the cell')
  assert.equal(s.canContinue, false, 'a problem blocks Continue')
  console.log(`  option fetches: ${fetches}`)
})

/**
 * The grid holds text, because that is what a spreadsheet cell is. What reaches
 * a destination must be what the destination declares — and the validator is
 * the thing that converts between them.
 *
 * Sending the draft strings straight through put `platforms: "doordash|ubereats"`
 * on the wire where the API declares `list[PLATFORM]`, and every multi-valued or
 * reference column 422'd on every template.
 */
test('commit sends validator-coerced values, not the raw draft strings', async () => {
  const loadOptions = async (key: string) =>
    key === 'people'
      ? [{ value: 'alex@example.com', display_label: 'Alex Morgan' }]
      : [
          { value: 'WEEKLY_DIGEST', display_label: 'Weekly digest' },
          { value: 'DAILY_ALERTS', display_label: 'Daily alerts' },
        ]

  let sent: any = null
  function Harness() {
    const s = useImportSession({
      template: SUBSCRIPTIONS,
      optionCtx: { tenant: 't', loadOptions },
      apply: async (rows: any) => {
        sent = rows
        return rows.map((r: any) => ({ row_no: r.row_no, status: 'applied', key: null, error: null, detail: {} }))
      },
      onClose: () => {},
    })
    ;(globalThis as any).__c = s
    return null
  }

  const root2 = createRoot(document.createElement('div'))
  await act(async () => { root2.render(React.createElement(Harness)) })
  await act(async () => {
    ;(globalThis as any).__c.loadText(
      'email,topics\nAlex@Example.com,weekly_digest|daily_alerts\n',
      'subscriptions.csv',
    )
  })
  await act(async () => { await new Promise((r) => setTimeout(r, 450)) })
  await act(async () => { await (globalThis as any).__c.commit() })

  assert.ok(sent, 'the mount was called')
  assert.deepEqual(
    sent[0].values.topics,
    ['WEEKLY_DIGEST', 'DAILY_ALERTS'],
    'a multi column arrives as an array in the API\'s own casing, not a pipe-delimited string',
  )
  assert.equal(sent[0].values.email, 'alex@example.com', 'a reference resolves to its canonical value')
})

/**
 * Finding 1 from the review of #3937.
 *
 * `runCheck` had no cancellation. Pressing "Import another file" mid-check left
 * the request running; when it resolved it wrote into the session that had just
 * been cleared, and the dialog showed a finished check over an empty grid.
 */
test('a check still in flight cannot write into a session that was reset', async () => {
  const loadOptions = async () => {
    await new Promise((r) => setTimeout(r, 120))
    return []
  }

  function Harness() {
    const s = useImportSession({
      template: STORES,
      optionCtx: { tenant: 't', loadOptions },
      apply: async () => [],
      onClose: () => {},
    })
    ;(globalThis as any).__r = s
    return null
  }

  const root = createRoot(document.createElement('div'))
  await act(async () => { root.render(React.createElement(Harness)) })

  // load a file; the automatic first pass starts and blocks on the fetch
  await act(async () => {
    ;(globalThis as any).__r.loadText('id,name,address\n,Corner Shop,1 St\n', 'a.csv')
  })
  await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  assert.equal((globalThis as any).__r.check, 'running', 'the check is in flight')

  // the customer starts over before it lands
  await act(async () => { (globalThis as any).__r.reset() })
  await act(async () => { await new Promise((r) => setTimeout(r, 500)) })

  const s = (globalThis as any).__r
  assert.equal(s.phase, 'upload', 'stays on upload')
  assert.equal(s.check, 'idle', 'the stale check did not mark itself done')
  assert.equal(s.rows.length, 0, 'and wrote no rows')
})

/**
 * Finding 2: `GRID_RENDER_CAP` was exported but referenced nowhere, so
 * "Show 60 more" grew without limit.
 */
test('the grid stops growing at the render cap', async () => {
  const loadOptions = async () => []

  function Harness() {
    const s = useImportSession({
      template: STORES,
      optionCtx: { tenant: 't', loadOptions },
      apply: async () => [],
      onClose: () => {},
    })
    ;(globalThis as any).__k = s
    return null
  }
  const root = createRoot(document.createElement('div'))
  await act(async () => { root.render(React.createElement(Harness)) })

  const body = Array.from({ length: 700 }, (_, i) => `,Store ${i},${i} St`).join('\n')
  await act(async () => { (globalThis as any).__k.loadText(`id,name,address\n${body}\n`, 'big.csv') })
  await act(async () => { await new Promise((r) => setTimeout(r, 450)) })

  assert.equal((globalThis as any).__k.rows.length, 700, 'all rows are held')
  for (let i = 0; i < 40; i++) await act(async () => { (globalThis as any).__k.showMore() })

  const s = (globalThis as any).__k
  assert.equal(s.visible.length, GRID_RENDER_CAP, 'rendering stops at the cap')
  assert.equal(s.hasMore, false, 'and stops offering more')
  assert.equal(s.cappedAt, GRID_RENDER_CAP, 'the UI is told why')
})

test('a skipped row is not counted as written, and starting over clears the totals', async () => {
  const loadOptions = async () => []
  function Harness() {
    const s = useImportSession({
      template: STORES,
      optionCtx: { tenant: 't', loadOptions },
      apply: async (rows: any) =>
        rows.map((r: any) =>
          r.row_no === 2
            ? { row_no: 2, status: 'failed', key: null, error: 'ID 48121 not found', detail: {} }
            : { row_no: r.row_no, status: 'applied', key: null, error: null, detail: {} },
        ),
      onClose: () => {},
    })
    ;(globalThis as any).__skip = s
    return null
  }
  const root = createRoot(document.createElement('div'))
  await act(async () => { root.render(React.createElement(Harness)) })
  await act(async () => { (globalThis as any).__skip.loadText('id,name,address\n,Corner Shop,1 St\n48121,Harbor Shop,2 St\n', 'two.csv') })
  await act(async () => { await new Promise((r) => setTimeout(r, 450)) })
  await act(async () => { await (globalThis as any).__skip.commit() })

  let s = (globalThis as any).__skip
  assert.equal(s.phase, 'result')
  assert.equal(s.committed.created + s.committed.updated, 1, 'only the row that landed is counted')
  const failed = s.failures[0].rowKey
  await act(async () => { s.skipFailure(failed) })
  s = (globalThis as any).__skip
  assert.equal(s.skippedCount, 1, 'the skip is remembered')
  assert.equal(s.failures.length, 0)

  await act(async () => { s.reset() })
  s = (globalThis as any).__skip
  assert.equal(s.committed.created + s.committed.updated, 0, 'totals start again from zero')
  assert.equal(s.skippedCount, 0)
})

test('a file whose columns match nothing says so', async () => {
  function Harness() {
    const s = useImportSession({
      template: STORES,
      optionCtx: { tenant: 't', loadOptions: async () => [] },
      apply: async () => [],
      onClose: () => {},
    })
    ;(globalThis as any).__wrong = s
    return null
  }
  const root = createRoot(document.createElement('div'))
  await act(async () => { root.render(React.createElement(Harness)) })
  await act(async () => { (globalThis as any).__wrong.loadText('sku,price\nA1,3\n', 'menu.csv') })
  const s = (globalThis as any).__wrong
  assert.equal(s.phase, 'upload')
  assert.match(s.error, /does not look like a Stores file/)
})
