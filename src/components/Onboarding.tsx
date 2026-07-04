import { useState } from "react";
import clsx from "clsx";
import { Icon } from "./primitives";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useAnalysisStore } from "@/store/useAnalysisStore";
import type { ProviderId } from "@/lib/types";
import logo from "../assets/Lumina_white.svg";

const ORDER: ProviderId[] = ["openai", "gemini", "openrouter", "custom"];

/**
 * First-run gate. Lets the analyst pick an LLM provider and drop in their own
 * key — or skip entirely (the pipeline still runs on the deterministic
 * heuristic fallback, and keys can be added later in Settings).
 */
export default function Onboarding() {
  const { settings, save, busy } = useSettingsStore();
  const refreshHealth = useAnalysisStore((s) => s.refreshHealth);
  const [provider, setProvider] = useState<ProviderId>(
    settings?.activeProvider ?? "openai"
  );
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");

  if (!settings) return null;
  const p = settings.providers[provider];

  async function finish(skip: boolean) {
    if (skip) {
      await save({ onboarded: true });
    } else {
      await save({
        onboarded: true,
        activeProvider: provider,
        providers: {
          [provider]: {
            apiKey: key.trim() || undefined,
            model: model.trim() || undefined,
          },
        },
      });
    }
    refreshHealth();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
      <div className="scanline" aria-hidden />
      <div className="w-full max-w-2xl tui-border bg-surface-container-low p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src={logo} alt="Lumina" className="h-12" />
          <div className="text-[11px] uppercase tracking-[0.3em] text-on-surface-variant">
            SYSTEM_INIT · ANALYST_ONBOARDING
          </div>
          <p className="max-w-md text-[12px] leading-relaxed text-on-surface-variant">
            Lumina runs on <span className="text-on-surface">your own</span> LLM
            resources. Connect a provider key to enable AI synthesis and the
            analyst chat. You can skip this and add a key later in{" "}
            <span className="text-accent-teal">Settings</span>.
          </p>
        </div>

        {/* Provider picker */}
        <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
          {ORDER.map((id) => (
            <button
              key={id}
              onClick={() => setProvider(id)}
              className={clsx(
                "p-3 text-left text-[11px] font-bold transition-colors tui-border",
                id === provider
                  ? "border-accent-teal bg-accent-teal/5 text-accent-teal"
                  : "text-on-surface hover:border-on-surface-variant"
              )}
            >
              {settings.providers[id].label}
            </button>
          ))}
        </div>

        {/* Key + model */}
        <div className="mb-2 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[9px] uppercase tracking-widest text-on-surface-variant">
              {p.label} API Key
            </span>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={p.hasKey ? `configured · ${p.keyHint}` : "paste key…"}
              className="w-full bg-surface-container px-3 py-2 text-xs tui-border outline-none focus:border-accent-teal"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[9px] uppercase tracking-widest text-on-surface-variant">
              Model
            </span>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={p.model}
              className="w-full bg-surface-container px-3 py-2 text-xs tui-border outline-none focus:border-accent-teal"
              spellCheck={false}
            />
          </label>
        </div>
        {p.docs && (
          <a
            href={p.docs}
            target="_blank"
            rel="noreferrer"
            className="mb-6 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-accent-teal hover:underline"
          >
            <Icon name="open_in_new" className="text-[13px]" /> Where do I get a key?
          </a>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            className="text-[11px] uppercase tracking-widest text-on-surface-variant hover:text-on-surface"
            disabled={busy}
            onClick={() => finish(true)}
          >
            [ SKIP_FOR_NOW ]
          </button>
          <button
            className="tui-btn-primary px-6 py-3"
            disabled={busy}
            onClick={() => finish(false)}
          >
            {busy ? "SAVING…" : "CONNECT_&_CONTINUE"}
          </button>
        </div>
      </div>
    </div>
  );
}
