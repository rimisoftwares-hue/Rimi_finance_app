import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchExistingCustomerCheck } from '../api/customerCheckApi';
import {
  EMPTY_FIELD_MATCH_MAP,
  createExistingCustomerCheckController,
  type ExistingCustomerCheckSnapshot,
  type ExistingCustomerPanelState,
  type UseExistingCustomerCheckInput,
} from './existingCustomerCheckModel';

export * from './existingCustomerCheckModel';

/**
 * React hook for real-time existing customer / guarantor check in Step 1 and Step 3.
 */
export function useExistingCustomerCheck(input: UseExistingCustomerCheckInput) {
  const [state, setState] = useState<ExistingCustomerCheckSnapshot>({
    matches: [],
    matchCount: 0,
    loading: false,
    error: null,
    highestRiskLevel: null,
    fieldMatchMap: EMPTY_FIELD_MATCH_MAP,
    panelState: 'hidden',
    signature: '',
  });

  const controllerRef = useRef<ReturnType<typeof createExistingCustomerCheckController> | null>(
    null
  );

  if (!controllerRef.current) {
    controllerRef.current = createExistingCustomerCheckController({
      debounceMs: 400,
      fetcher: fetchExistingCustomerCheck,
      onChange: (next) => setState(next),
    });
  }

  useEffect(() => {
    controllerRef.current?.updateInput(input);
  }, [
    input.contacts,
    input.phones,
    input.aadhar,
    input.otherGovtIdType,
    input.otherGovtIdNumber,
    input.excludeCustomerId,
    input.financeScopeKey,
  ]);

  useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
    };
  }, []);

  const setPanelState = useCallback((nextState: ExistingCustomerPanelState) => {
    controllerRef.current?.setPanelState(nextState);
  }, []);

  return useMemo(
    () => ({
      matches: state.matches,
      matchCount: state.matchCount,
      loading: state.loading,
      error: state.error,
      highestRiskLevel: state.highestRiskLevel,
      fieldMatchMap: state.fieldMatchMap,
      panelState: state.panelState,
      setPanelState,
    }),
    [state, setPanelState]
  );
}
