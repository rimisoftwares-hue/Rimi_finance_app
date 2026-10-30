import { useEffect, useState } from "react";

export interface GroupF12Config {
  allowAdvancedMasters: boolean;
  allowAliases: boolean;
  useAddresses: boolean;
  useContactDetails: boolean;
  addNotes: boolean;
  addDescription: boolean;
  // Legacy / existing
  showNatureOfGroup: boolean;
  enableAutoInheritance: boolean;
  enableTallyShortcuts: boolean;
  enableDynamicParentLogic: boolean;
  showHierarchy: boolean;
  enableSubLedger: boolean;
  nettReporting: boolean;
}

export const DEFAULT_GROUP_CONFIG: GroupF12Config = {
  allowAdvancedMasters: true,
  allowAliases: true,
  useAddresses: true,
  useContactDetails: true,
  addNotes: false,
  addDescription: false,
  showNatureOfGroup: true,
  enableAutoInheritance: true,
  enableTallyShortcuts: true,
  enableDynamicParentLogic: true,
  showHierarchy: true,
  enableSubLedger: false,
  nettReporting: false,
};

const KEY = "erp:groupConfig";
const EVT = "erp:groupConfig:change";

export function loadGroupConfig(): GroupF12Config {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_GROUP_CONFIG;
    return { ...DEFAULT_GROUP_CONFIG, ...JSON.parse(raw) };
  } catch { return DEFAULT_GROUP_CONFIG; }
}

export function saveGroupConfig(cfg: GroupF12Config) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
    window.dispatchEvent(new CustomEvent(EVT, { detail: cfg }));
  } catch {}
}

export function useGroupConfig(): [GroupF12Config, (c: GroupF12Config) => void] {
  const [cfg, setCfg] = useState<GroupF12Config>(loadGroupConfig);
  useEffect(() => {
    const h = (e: Event) => setCfg((e as CustomEvent).detail);
    const s = () => setCfg(loadGroupConfig());
    window.addEventListener(EVT, h as EventListener);
    window.addEventListener("storage", s);
    return () => {
      window.removeEventListener(EVT, h as EventListener);
      window.removeEventListener("storage", s);
    };
  }, []);
  const update = (c: GroupF12Config) => { setCfg(c); saveGroupConfig(c); };
  return [cfg, update];
}
