import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TEMPLATE_SETTINGS_STORAGE_PREFIX,
  SELECTED_DOC_TYPE_STORAGE_PREFIX,
  DEFAULT_TEMPLATE_SETTINGS,
  getTemplateSettingsStorageKey,
  getSelectedDocTypeStorageKey,
  hydrateTemplateSettings,
  hydrateSelectedDocType,
  persistTemplateSettingsSync,
  createDebouncedSettingsWriter,
  updateDocumentTemplateSettings,
  resetDocumentTemplateSettings,
  toPrintTemplateOptions,
} from '../src/components/Notice/templateSettings.ts';
import { buildCompletePrintHtml } from '../src/components/common/print/printBuilder.ts';
import type { PrintDocTypeId } from '../src/components/common/print/types.ts';
import {
  FIXED_ISO_NOW,
  SAMPLE_FINANCE,
  makeSyntheticCustomer,
  withFrozenDate,
} from '../../test_assets/notice-print-baselines/captureBaselines.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SNAPSHOT_DIR = path.resolve(
  __dirname,
  '../../test_assets/notice-print-baselines/snapshots'
);

class MemoryStorage {
  public store = new Map<string, string>();
  public setCalls = 0;
  public throwOnGet = false;
  public throwOnSet = false;

  getItem(key: string): string | null {
    if (this.throwOnGet) throw new Error('SecurityError: storage disabled');
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.setCalls += 1;
    if (this.throwOnSet) throw new Error('QuotaExceededError');
    this.store.set(key, value);
  }
}

const ALL_DOC_TYPES: PrintDocTypeId[] = [
  'ledger',
  'due_card',
  'seizing_letter',
  'defaulter_customer',
  'defaulter_coapplicant',
];

test('1. Storage keys scope per financeId when available and fall back cleanly to global key', () => {
  assert.equal(TEMPLATE_SETTINGS_STORAGE_PREFIX, 'rimi:notices:template-settings:v1');
  assert.equal(getTemplateSettingsStorageKey('fin-42'), 'rimi:notices:template-settings:v1:fin-42');
  assert.equal(getTemplateSettingsStorageKey(108), 'rimi:notices:template-settings:v1:108');
  assert.equal(getTemplateSettingsStorageKey(null), 'rimi:notices:template-settings:v1');
  assert.equal(getTemplateSettingsStorageKey(undefined), 'rimi:notices:template-settings:v1');
  assert.equal(getTemplateSettingsStorageKey('   '), 'rimi:notices:template-settings:v1');

  assert.equal(
    getSelectedDocTypeStorageKey('fin-42'),
    `${SELECTED_DOC_TYPE_STORAGE_PREFIX}:fin-42`
  );
  assert.equal(getSelectedDocTypeStorageKey(null), SELECTED_DOC_TYPE_STORAGE_PREFIX);
});

test('2. Initial defaults preserve exact existing Notices.tsx behavior across all 5 documents', () => {
  const storage = new MemoryStorage();
  const hydrated = hydrateTemplateSettings(storage, 'fin-1');

  for (const docType of ALL_DOC_TYPES) {
    const cfg = hydrated[docType];
    assert.equal(cfg.theme, 'classic');
    assert.equal(cfg.watermark, false);
    assert.equal(cfg.footer, true);
    assert.equal(cfg.showLogo, true);

    for (const [k, v] of Object.entries(cfg)) {
      if (k !== 'theme' && k !== 'watermark') {
        assert.equal(v, true, `Expected ${docType}.${k} to default to true`);
      }
    }
  }

  // Ensure mutating hydrated copy never mutates DEFAULT_TEMPLATE_SETTINGS
  hydrated.ledger.watermark = true;
  assert.equal(DEFAULT_TEMPLATE_SETTINGS.ledger.watermark, false);
});

test('3. Hydration handles malformed JSON, non-object roots, and storage read errors without crashing', () => {
  const key = getTemplateSettingsStorageKey('fin-err');

  for (const badPayload of ['{not-valid-json', 'null', '[]', '12345', '"just-a-string"']) {
    const storage = new MemoryStorage();
    storage.store.set(key, badPayload);
    const result = hydrateTemplateSettings(storage, 'fin-err');
    assert.deepEqual(result, DEFAULT_TEMPLATE_SETTINGS);
  }

  const throwingStorage = new MemoryStorage();
  throwingStorage.throwOnGet = true;
  assert.deepEqual(hydrateTemplateSettings(throwingStorage, 'fin-err'), DEFAULT_TEMPLATE_SETTINGS);
});

test('4. Hydration deep-merges valid fields, rejects wrong types & unknown themes, and strips unknown keys', () => {
  const storage = new MemoryStorage();
  const key = getTemplateSettingsStorageKey('fin-merge');
  storage.store.set(
    key,
    JSON.stringify({
      ledger: {
        theme: 'modern',
        watermark: true,
        footer: 'false', // wrong type -> fallback to true
        showLogo: 0, // wrong type -> fallback to true
        showBroker: false,
        showPenalty: false,
        injectedUnknownField: true, // unknown key -> ignored
      },
      due_card: {
        theme: 'cyberpunk', // invalid theme -> fallback to classic
        showGuarantor: false,
      },
      seizing_letter: 'invalid-entry', // non-object -> fallback to defaults
      unknown_doc_type: {
        theme: 'compact',
      },
    })
  );

  const hydrated = hydrateTemplateSettings(storage, 'fin-merge');

  assert.equal(hydrated.ledger.theme, 'modern');
  assert.equal(hydrated.ledger.watermark, true);
  assert.equal(hydrated.ledger.footer, true);
  assert.equal(hydrated.ledger.showLogo, true);
  assert.equal(hydrated.ledger.showBroker, false);
  assert.equal(hydrated.ledger.showPenalty, false);
  assert.equal(hydrated.ledger.showInterestRate, true);
  assert.equal('injectedUnknownField' in hydrated.ledger, false);

  assert.equal(hydrated.due_card.theme, 'classic');
  assert.equal(hydrated.due_card.showGuarantor, false);
  assert.equal(hydrated.due_card.showDatesBar, true);

  assert.deepEqual(hydrated.seizing_letter, DEFAULT_TEMPLATE_SETTINGS.seizing_letter);
  assert.deepEqual(hydrated.defaulter_customer, DEFAULT_TEMPLATE_SETTINGS.defaulter_customer);
  assert.deepEqual(hydrated.defaulter_coapplicant, DEFAULT_TEMPLATE_SETTINGS.defaulter_coapplicant);
  assert.equal('unknown_doc_type' in hydrated, false);
});

test('5. Hydrating selected docType validates against the 5 known PrintDocTypeId values', () => {
  const storage = new MemoryStorage();
  const key = getSelectedDocTypeStorageKey('fin-doc');
  assert.equal(hydrateSelectedDocType(storage, 'fin-doc'), 'ledger');

  storage.store.set(key, 'due_card');
  assert.equal(hydrateSelectedDocType(storage, 'fin-doc'), 'due_card');

  storage.store.set(key, 'non_existent_doc');
  assert.equal(hydrateSelectedDocType(storage, 'fin-doc'), 'ledger');
});

test('6. Resetting a document restores ONLY that active document while keeping other documents intact', () => {
  let state = hydrateTemplateSettings(new MemoryStorage(), 'fin-reset');
  state = updateDocumentTemplateSettings(state, 'ledger', {
    theme: 'premium',
    watermark: true,
    showInterestRate: false,
  });
  state = updateDocumentTemplateSettings(state, 'due_card', {
    theme: 'compact',
    footer: false,
    showGuarantor: false,
  });

  const afterResetLedger = resetDocumentTemplateSettings(state, 'ledger');
  assert.deepEqual(afterResetLedger.ledger, DEFAULT_TEMPLATE_SETTINGS.ledger);
  assert.equal(afterResetLedger.due_card.theme, 'compact');
  assert.equal(afterResetLedger.due_card.footer, false);
  assert.equal(afterResetLedger.due_card.showGuarantor, false);
});

test('7. Debounced writer coalesces rapid updates (~150ms) and swallows QuotaExceededError safely', async () => {
  const storage = new MemoryStorage();
  const writer = createDebouncedSettingsWriter(storage, 60);

  let state = hydrateTemplateSettings(storage, 'fin-debounce');
  state = updateDocumentTemplateSettings(state, 'ledger', { theme: 'modern' });
  writer.schedule('fin-debounce', state);

  state = updateDocumentTemplateSettings(state, 'ledger', { watermark: true });
  writer.schedule('fin-debounce', state);

  state = updateDocumentTemplateSettings(state, 'ledger', { showPhotos: false });
  writer.schedule('fin-debounce', state);

  assert.equal(storage.setCalls, 0);
  await new Promise((r) => setTimeout(r, 110));
  assert.equal(storage.setCalls, 1);

  const rehydrated = hydrateTemplateSettings(storage, 'fin-debounce');
  assert.equal(rehydrated.ledger.theme, 'modern');
  assert.equal(rehydrated.ledger.watermark, true);
  assert.equal(rehydrated.ledger.showPhotos, false);

  // Quota error safety
  storage.throwOnSet = true;
  assert.doesNotThrow(() => persistTemplateSettingsSync(storage, 'fin-debounce', state));
  writer.cancel();
});

test('8. Phase 1 Golden Baseline: default template settings produce byte-identical HTML to Phase 0 snapshots', () => {
  const shortItem = makeSyntheticCustomer(5);
  const longItem = makeSyntheticCustomer(42);
  const defaults = hydrateTemplateSettings(new MemoryStorage(), 'fin-golden');

  withFrozenDate(FIXED_ISO_NOW, () => {
    for (const docType of ALL_DOC_TYPES) {
      const opts = toPrintTemplateOptions(docType, defaults[docType]);
      const builtShort = buildCompletePrintHtml(
        [shortItem],
        SAMPLE_FINANCE,
        docType,
        opts,
        `Baseline - ${docType}`
      );
      const expectedShort = fs.readFileSync(
        path.join(SNAPSHOT_DIR, `${docType}.short.html`),
        'utf8'
      );
      assert.equal(
        builtShort.html,
        expectedShort,
        `Golden short HTML mismatch for ${docType}`
      );

      const builtLong = buildCompletePrintHtml(
        [longItem],
        SAMPLE_FINANCE,
        docType,
        opts,
        `Baseline Long - ${docType}`
      );
      const expectedLong = fs.readFileSync(
        path.join(SNAPSHOT_DIR, `${docType}.long.html`),
        'utf8'
      );
      assert.equal(
        builtLong.html,
        expectedLong,
        `Golden long HTML mismatch for ${docType}`
      );
    }
  });
});
