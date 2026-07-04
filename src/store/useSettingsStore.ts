import { create } from "zustand";
import type {
  ProviderId,
  ProviderPatch,
  SettingsPatch,
  SettingsView,
  TestProviderResult,
} from "@/lib/types";
import * as api from "@/lib/api";

interface SettingsState {
  settings: SettingsView | null;
  loaded: boolean;
  busy: boolean;
  error: string | null;

  load: () => Promise<void>;
  save: (patch: SettingsPatch) => Promise<void>;
  setActiveProvider: (provider: ProviderId) => Promise<void>;
  saveProvider: (provider: ProviderId, patch: ProviderPatch) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  test: (provider: ProviderId) => Promise<TestProviderResult>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loaded: false,
  busy: false,
  error: null,

  load: async () => {
    try {
      const settings = await api.getSettings();
      set({ settings, loaded: true, error: null });
    } catch (e) {
      set({ error: String(e), loaded: true });
    }
  },

  save: async (patch) => {
    set({ busy: true, error: null });
    try {
      const settings = await api.updateSettings(patch);
      set({ settings, busy: false });
    } catch (e) {
      set({ error: String(e), busy: false });
    }
  },

  setActiveProvider: async (provider) => {
    await get().save({ activeProvider: provider });
  },

  saveProvider: async (provider, patch) => {
    await get().save({ providers: { [provider]: patch } });
  },

  completeOnboarding: async () => {
    await get().save({ onboarded: true });
  },

  test: async (provider) => {
    set({ busy: true });
    const res = await api.testProvider(provider);
    set({ busy: false });
    return res;
  },
}));
