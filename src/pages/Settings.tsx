import { useEffect } from "react";
import clsx from "clsx";
import { Module, Icon } from "@/components/primitives";
import ProviderEditor from "@/components/ProviderEditor";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useAnalysisStore } from "@/store/useAnalysisStore";
import type { ProviderId } from "@/lib/types";

const ORDER: ProviderId[] = ["openai", "gemini", "openrouter", "custom"];

export default function Settings() {
  const { settings, loaded, load, setActiveProvider } = useSettingsStore();
  const refreshHealth = useAnalysisStore((s) => s.refreshHealth);

  useEffect(() => {
    if (!loaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-on-surface-variant">
        Loading settings…
      </div>
    );
  }

  const active = settings.activeProvider;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-on-surface-variant">
        <span>&gt; LUMINA_ROOT / CONFIG / LLM_PROVIDERS</span>
        <span>BRING_YOUR_OWN_KEY</span>
      </div>

      <Module label="MODULE: MODEL_ENGINE" labelColor="text-accent-teal">
        <p className="mb-5 text-[11px] leading-relaxed text-on-surface-variant">
          Lumina uses <span className="text-on-surface">your own</span> API keys and
          compute. Keys are stored locally on this machine (in
          <span className="text-accent-teal"> ~/.lumina/config.json</span>) and are
          never uploaded. Pick the active provider used for AI synthesis and chat.
        </p>

        {/* Active-provider selector */}
        <div className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
          {ORDER.map((id) => {
            const p = settings.providers[id];
            const isActive = id === active;
            return (
              <button
                key={id}
                onClick={async () => {
                  await setActiveProvider(id);
                  refreshHealth();
                }}
                className={clsx(
                  "flex flex-col items-start gap-1 p-3 text-left transition-colors tui-border",
                  isActive
                    ? "border-accent-teal bg-accent-teal/5"
                    : "hover:border-on-surface-variant"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={clsx(
                      "text-[11px] font-bold",
                      isActive ? "text-accent-teal" : "text-on-surface"
                    )}
                  >
                    {p.label}
                  </span>
                  {isActive && <Icon name="check_circle" className="text-[14px] text-accent-teal" />}
                </div>
                <span
                  className={clsx(
                    "text-[9px] uppercase tracking-widest",
                    p.hasKey ? "text-accent-teal" : "text-on-surface-variant"
                  )}
                >
                  {p.hasKey ? "KEY_SET" : "NO_KEY"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Per-provider editors */}
        <div className="space-y-6">
          {ORDER.map((id) => {
            const p = settings.providers[id];
            return (
              <div
                key={id}
                className={clsx(
                  "p-4 tui-border",
                  id === active ? "border-accent-teal/40" : "border-outline-variant"
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-widest">
                    {p.label}
                  </span>
                  {id === active && (
                    <span className="tui-tag border-accent-teal text-accent-teal">ACTIVE</span>
                  )}
                </div>
                <ProviderEditor id={id} view={p} showBaseUrl={id === "custom"} />
              </div>
            );
          })}
        </div>
      </Module>
    </div>
  );
}
