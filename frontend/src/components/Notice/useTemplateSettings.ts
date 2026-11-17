import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PrintDocTypeId, PrintTemplateOptions } from '@/components/common/print';
import {
  createDebouncedSettingsWriter,
  DocumentTemplateConfigMap,
  getTemplateSettingsStorageKey,
  hydrateSelectedDocType,
  hydrateTemplateSettings,
  persistSelectedDocTypeSync,
  persistTemplateSettingsSync,
  resetDocumentTemplateSettings,
  StorageLike,
  TemplateSettingsMap,
  toPrintTemplateOptions,
  updateDocumentTemplateSettings,
} from './templateSettings';

const getBrowserStorage = (): StorageLike | null => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore restricted storage access
  }
  return null;
};

export function useTemplateSettings(financeId?: string | number | null) {
  const storageRef = useRef<StorageLike | null>(getBrowserStorage());
  const writerRef = useRef(createDebouncedSettingsWriter(storageRef.current, 150));
  const currentFinanceRef = useRef<string | number | null | undefined>(financeId);

  const [settings, setSettings] = useState<TemplateSettingsMap>(() =>
    hydrateTemplateSettings(storageRef.current, financeId)
  );

  const [selectedDocTypeId, setSelectedDocTypeIdState] = useState<PrintDocTypeId>(() =>
    hydrateSelectedDocType(storageRef.current, financeId)
  );

  // Re-hydrate cleanly when switching finance company
  useEffect(() => {
    if (currentFinanceRef.current === financeId) return;
    writerRef.current.flush();
    currentFinanceRef.current = financeId;
    setSettings(hydrateTemplateSettings(storageRef.current, financeId));
    setSelectedDocTypeIdState(hydrateSelectedDocType(storageRef.current, financeId));
  }, [financeId]);

  // Flush pending debounced writes before unload / unmount so instant reload preserves changes
  useEffect(() => {
    const writer = writerRef.current;
    const handleBeforeUnload = () => {
      writer.flush();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      writer.flush();
    };
  }, []);

  const setSelectedDocTypeId = useCallback(
    (nextDocType: PrintDocTypeId) => {
      setSelectedDocTypeIdState(nextDocType);
      persistSelectedDocTypeSync(storageRef.current, currentFinanceRef.current, nextDocType);
    },
    []
  );

  const updateDocSettings = useCallback(
    <K extends PrintDocTypeId>(docType: K, patch: Partial<DocumentTemplateConfigMap[K]>) => {
      setSettings((prev) => {
        const next = updateDocumentTemplateSettings(prev, docType, patch);
        writerRef.current.schedule(currentFinanceRef.current, next);
        return next;
      });
    },
    []
  );

  const resetDocSettings = useCallback((docType: PrintDocTypeId) => {
    setSettings((prev) => {
      const next = resetDocumentTemplateSettings(prev, docType);
      writerRef.current.cancel();
      persistTemplateSettingsSync(storageRef.current, currentFinanceRef.current, next);
      return next;
    });
  }, []);

  const activeConfig = settings[selectedDocTypeId];

  const activePrintOptions: PrintTemplateOptions = useMemo(
    () => toPrintTemplateOptions(selectedDocTypeId, activeConfig),
    [selectedDocTypeId, activeConfig]
  );

  const storageKey = useMemo(() => getTemplateSettingsStorageKey(financeId), [financeId]);

  return {
    settings,
    selectedDocTypeId,
    setSelectedDocTypeId,
    activeConfig,
    activePrintOptions,
    updateDocSettings,
    resetDocSettings,
    storageKey,
  };
}
