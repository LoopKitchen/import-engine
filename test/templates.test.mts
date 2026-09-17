import { test } from 'node:test'
import assert from 'node:assert/strict'

const { STARTER_TEMPLATE, defineImportTemplate, extendImportTemplate, getTemplate } = await import('../src/templates.ts')
const { indexEntries } = await import('../src/optionSources.ts')
const { validateWith } = await import('../src/validate.ts')

const MENU_ITEMS = extendImportTemplate(STARTER_TEMPLATE, {
  key: 'menu_items',
  label: 'Menu items',
  description: 'Add menu items or update their prices.',
  upsertKey: ['sku'],
  removeColumns: ['email'],
  updateColumns: { name: { label: 'Item name' } },
  addColumns: [
    { key: 'sku', type: 'text', label: 'SKU', required: true, example: 'PZ-01' },
    { key: 'price', type: 'currency', label: 'Price', required: true, example: '14.00' },
    { key: 'location', type: 'ref', label: 'Location', required: true, list: 'locations', listLabel: 'Locations' },
  ],
})

test('the starter template is general and complete', () => {
  assert.equal(STARTER_TEMPLATE.key, 'contacts')
  assert.deepEqual(STARTER_TEMPLATE.columns.map((c) => c.key), ['name', 'email'])
  assert.deepEqual(STARTER_TEMPLATE.upsert_key, ['email'])
})

test('extending removes, updates and adds columns without touching the base', () => {
  assert.deepEqual(MENU_ITEMS.columns.map((c) => c.key), ['name', 'sku', 'price', 'location'])
  assert.equal(MENU_ITEMS.columns[0].label, 'Item name')
  assert.equal(MENU_ITEMS.columns[0].required, true, 'an updated column keeps what it did not change')
  assert.deepEqual(MENU_ITEMS.upsert_key, ['sku'])
  assert.equal(MENU_ITEMS.columns[3].option_source?.key, 'locations')
  assert.deepEqual(MENU_ITEMS.sample_rows, [{ name: 'Alex Morgan', sku: 'PZ-01', price: '14.00', location: '' }])
  assert.deepEqual(STARTER_TEMPLATE.columns.map((c) => c.key), ['name', 'email'], 'the starter is unchanged')
})

test('mistakes in a template fail when it is defined, not when someone imports', () => {
  assert.throws(() => extendImportTemplate(STARTER_TEMPLATE, { key: 'x', label: 'X', removeColumns: ['email'] }), /identifies rows by 'email'/)
  assert.throws(() => extendImportTemplate(STARTER_TEMPLATE, { key: 'x', label: 'X', removeColumns: ['phone'] }), /no 'phone' column/)
  assert.throws(() => extendImportTemplate(STARTER_TEMPLATE, { key: 'x', label: 'X', addColumns: [{ key: 'email', type: 'text' }] }), /two 'email' columns/)
})

test('rules and existence checks carry over only while their columns exist', () => {
  const base = defineImportTemplate({
    key: 'events',
    label: 'Events',
    upsertKey: ['id'],
    columns: [
      { key: 'id', type: 'number' },
      { key: 'name', type: 'text', required: true },
      { key: 'starts', type: 'date' },
      { key: 'ends', type: 'date' },
    ],
    rules: [{ code: 'ends_after_starts', message: 'End must be after start.', columns: ['ends'], check: (r) => !r.starts || !r.ends || String(r.ends) >= String(r.starts) }],
    existenceRules: [{ code: 'event_exists', column: 'name', list: 'events', unlessPresent: 'id' }],
  })
  const trimmed = extendImportTemplate(base, { key: 'e2', label: 'E2', removeColumns: ['ends'] })
  assert.equal(trimmed.row_rules.length, 0)
  assert.equal(trimmed.existence_rules.length, 1)
  assert.equal(extendImportTemplate(base, { key: 'e3', label: 'E3' }).row_rules.length, 1)
})

test('a template is found by key only in the registry you pass', () => {
  assert.equal(getTemplate('menu_items', { menu_items: MENU_ITEMS }), MENU_ITEMS)
  assert.throws(() => getTemplate('menu_items'))
  assert.throws(() => getTemplate('constructor', { menu_items: MENU_ITEMS }))
})

test('a list entry can be matched by its value, its label, or any alias', () => {
  const locations = indexEntries([{ value: 12, display_label: 'Downtown', aliases: ['DT-1'] }, { value: 7, display_label: 'Uptown' }])
  assert.equal(locations.canonical('12'), '12')
  assert.equal(locations.canonical('downtown'), '12')
  assert.equal(locations.canonical(' dt-1 '), '12')
  assert.equal(locations.canonical('Midtown'), null)
})

test('an extended template validates like any other', () => {
  const options = new Map([['locations', indexEntries([{ value: 12, display_label: 'Downtown' }])]])
  const report = validateWith(
    MENU_ITEMS,
    [
      { name: 'Margherita', sku: 'PZ-01', price: '$14.00', location: 'Downtown' },
      { name: 'Pepperoni', sku: '', price: '15.50', location: 'Uptown' },
    ],
    options,
  )
  assert.deepEqual(report.rows[0].values, { name: 'Margherita', sku: 'PZ-01', price: 14, location: '12' })
  assert.equal(report.rows[0].valid, true)
  assert.deepEqual(report.rows[1].errors.map((e) => e.code).sort(), ['required', 'unknown_ref'])
})
