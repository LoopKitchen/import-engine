# @loop_ai/import-engine

A CSV import dialog for React and MUI. You describe the file you expect, and the dialog reads it, checks every row, lets people fix problems in a grid, and hands the clean rows to your own save function.

```bash
npm install @loop_ai/import-engine
```

Peer dependencies: `react`, `react-dom`, `@mui/material`.

## Quick start

```tsx
import { ImportButton, STARTER_TEMPLATE, extendImportTemplate } from '@loop_ai/import-engine'

const MENU_ITEMS = extendImportTemplate(STARTER_TEMPLATE, {
  key: 'menu_items',
  label: 'Menu items',
  description: 'Add menu items or update their prices.',
  upsertKey: ['sku'],
  removeColumns: ['email'],
  addColumns: [
    { key: 'sku', type: 'text', label: 'SKU', required: true },
    { key: 'price', type: 'currency', label: 'Price', required: true },
    { key: 'location', type: 'ref', label: 'Location', required: true, list: 'locations' },
  ],
})

export function MenuPage() {
  return (
    <ImportButton
      template={MENU_ITEMS}
      config={{
        getTenant: () => 'my-account',
        loadOptions: async (list) => {
          const res = await fetch(`/api/lists/${list}`)
          if (!res.ok) throw new Error(`Could not load ${list}`)
          return res.json()
        },
      }}
      onImport={async (rows) => {
        const res = await fetch('/api/menu-items/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rows.map((row) => row.values)),
        })
        if (!res.ok) throw new Error(`Save failed with ${res.status}`)
        return rows.map((row) => ({ row_no: row.row_no, status: 'applied' as const, key: String(row.values.sku), error: null, detail: {} }))
      }}
    />
  )
}
```

## What happens

1. The person clicks **Bulk import**. The dialog asks `loadOptions` for every list the template uses (here, `locations`).
2. They drop or paste a CSV. Headers are matched to columns by name.
3. Every row is checked: required cells, formats (numbers, dates, emails, links), fixed choices, values that must be in one of your lists, duplicates within the file, and any rules you add. Problems show on the cells, and people fix them in the grid.
4. They press **Import**. `onImport` receives the clean rows, with numbers as numbers, lists as arrays, and list values resolved to their canonical value:
   ```js
   [{ row_no: 1, values: { name: 'Margherita', sku: 'PZ-01', price: 14, location: '12' } }]
   ```
5. You save them and return one result per row. The dialog shows a receipt, or lists the rows that failed so they can be fixed and retried.

## Props

| Prop | What it does |
|---|---|
| `template` | The template to use. |
| `templateKey` | Alternative to `template`: a key looked up in `config.templates`. |
| `onImport` | `(rows, template) => Promise<results>`. Saves the rows. Return one `{ row_no, status, key, error, detail }` per row, where `status` is `applied`, `updated`, `skipped` or `failed`, and `error` is shown next to a failed row. Throw if nothing could be saved. |
| `config.getTenant` | Returns the account the lists belong to. When it changes, the lists are loaded again. |
| `config.loadOptions` | `(list) => Promise<entries>`. Returns the values allowed in a list (see below). Throw if the list cannot be loaded. |
| `config.templates` | Optional. Templates by key, for `templateKey`. |
| `config.notify` | Optional. `(message, 'success' \| 'error' \| 'info') => void`, called once per import with the result. |
| `onApplied` | Optional. Called after each import, for example to refresh your page. |
| `onClose` | Optional, `ImportButton` only. Called whenever the dialog closes, after the person has seen the result. |
| `label`, `size`, `disabled`, `sx`, `render` | Optional, `ImportButton` only. Style the button, or `render` your own trigger. |

`ImportDialog` takes the same props plus `open` and `onClose`, for when you want to control opening yourself.

## Templates

A template describes one kind of file. Start from `STARTER_TEMPLATE` (a `name` and `email` contacts file) and change what you need with `extendImportTemplate`, or write one from scratch with `defineImportTemplate`.

```ts
import { defineImportTemplate } from '@loop_ai/import-engine'

const EVENTS = defineImportTemplate({
  key: 'events',
  label: 'Events',
  description: 'Add events, or update ones you already have by leaving their id in place.',
  upsertKey: ['id'],
  columns: [
    { key: 'id', type: 'number', label: 'Event id', hint: 'Leave blank to create a new event.' },
    { key: 'name', type: 'text', label: 'Name', required: true },
    { key: 'starts', type: 'date', label: 'Starts', required: true },
    { key: 'ends', type: 'date', label: 'Ends', required: true },
    { key: 'status', type: 'enum', label: 'Status', choices: ['draft', 'published'], default: 'draft' },
  ],
  rules: [
    {
      code: 'ends_after_starts',
      message: 'The end date must be on or after the start date.',
      columns: ['ends'],
      check: (row) => String(row.ends) >= String(row.starts),
    },
  ],
  existenceRules: [
    { code: 'event_exists', column: 'name', list: 'events', unlessPresent: 'id', message: 'An event with this name already exists.' },
  ],
  sampleRows: [{ id: '', name: 'Summer launch', starts: '2026-06-01', ends: '2026-06-02', status: 'draft' }],
})
```

### Template options

| Option | What it does |
|---|---|
| `key`, `label` | Identify the template. The label appears in the dialog title and messages. |
| `description` | Shown above the column list on the upload step. |
| `upsertKey` | The columns that identify a row. Two rows with the same values are flagged as duplicates. If every upsert column is optional, a blank value means "create" and a filled one means "update". |
| `columns` | The columns, in order (see below). |
| `sampleRows` | Example rows, shown on the upload step and used for the downloadable sample CSV. |
| `rules` | Checks across a row's cells. `check` receives the cleaned row and returns `true` when the row is fine. |
| `existenceRules` | Flag a row whose `column` value is already in `list`, unless `unlessPresent` is filled. `severity: 'warning'` shows the message without blocking the row. |

### Column options

| Option | What it does |
|---|---|
| `key` | The CSV header and the key in `row.values`. |
| `type` | `text`, `email`, `phone`, `number`, `currency`, `date`, `boolean`, `url`, `enum` (fixed choices), `ref` (one value from a list), `ref_list` (several values from a list). |
| `label` | Human name, used in the grid and in messages. |
| `required` | The cell must not be blank. |
| `multi` | Several values in one cell, separated by `\|`. They arrive as an array. |
| `choices` | The allowed values for an `enum` column. Matching ignores case. |
| `list`, `listLabel` | For `ref` and `ref_list`: the name of the list the value must be in, passed to `loadOptions`, and an optional readable name for it. |
| `parent` | For a list column that depends on another column in the same row (see below). |
| `default` | Used when an optional cell is blank. |
| `headerAliases` | Other header names accepted for this column. |
| `example`, `hint` | Shown to help people fill the file in. |

### Copying a template

`extendImportTemplate(base, changes)` returns a new template and leaves `base` untouched.

| Change | What it does |
|---|---|
| `key`, `label` | Required. |
| `description`, `upsertKey`, `sampleRows` | Replace the base values. Without `sampleRows`, the base samples are kept and new columns use their `example`. |
| `removeColumns` | Column keys to drop. |
| `addColumns` | Columns to append. |
| `updateColumns` | Changes to existing columns, by key, e.g. `{ name: { label: 'Item name' } }`. |
| `rules`, `existenceRules` | Replace the base rules. Without them, base rules are kept while their columns still exist. |

Mistakes such as removing the upsert column or adding a column twice throw when the template is defined, not when someone imports.

## Lists

A `ref` or `ref_list` column must match a value from one of your lists. The dialog asks `config.loadOptions(list)` once per list when it opens, and again when the person re-checks. Return entries like:

```js
[
  { value: 12, display_label: 'Downtown', aliases: ['DT-1'] },
  { value: 7, display_label: 'Uptown' },
]
```

- A cell matches an entry by its `value`, its `display_label`, or any of its `aliases`, ignoring case. The row receives the `value`.
- A value that is not in the list is flagged on the cell, with a few real values as a hint.
- If the list cannot be loaded, throw. The dialog then says it could not check those cells, instead of calling them wrong.

### Linked lists

A column with `parent` only accepts values linked to the parent cell in the same row. Give each parent entry its children as `dependents`:

```ts
columns: [
  { key: 'platform', type: 'ref', required: true, list: 'platforms' },
  { key: 'store_id', type: 'ref', required: true, list: 'platforms', parent: 'platform' },
]
```

```js
[
  { value: 'web', display_label: 'Web', dependents: [{ value: 'W-100' }, { value: 'W-101' }] },
  { value: 'app', display_label: 'App', dependents: [{ value: 'A-200' }] },
]
```

A `store_id` of `A-200` is accepted on an `app` row and flagged on a `web` row.
