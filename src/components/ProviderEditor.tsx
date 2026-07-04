import { useState } from "react";
import clsx from "clsx";
import { Icon } from "./primitives";
import { useSettingsStore } from "@/store/useSettingsStore";
import type { ProviderId, ProviderView, TestProviderResult } from "@/lib/types";

/**
 * Editable card for a single LLM provider. Handles its own dirty state so the
 * masked key placeholder from the backend is never re-submitted verbatim — the
 * key is only sent when the analyst types a new one.
 */
export default function ProviderEditor({
  id,
  view,
  showBaseUrl,
}: {
  id: ProviderId;
  view: ProviderView;
  showBaseUrl?: boolean;
}) {
  const { saveProvider, test, busy } = useSettingsStore();
  const [key, setKey] = useState("");
  const [model, setModel] = useState(view.model);
  const [baseUrl, setBaseUrl] = useState(view.baseUrl);
  const [result, setResult] = useState<TestProviderResult | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    key.trim().length > 0 || model !== view.model || baseUrl !== view.baseUrl;
  const isCustom = id === "custom";

  async function handleSave() {
    await saveProvider(id, {
      apiKey: key.trim() || undefined,
      model: model.trim() || undefined,
      baseUrl: showBaseUrl || isCustom ? baseUrl.trim() || undefined : undefined,
    });
    setKey("");
    setSaved(true);
    setResult(null);
    setTimeout(() => setSaved(false), 1800);
  }

  async function handleTest() {
    // Persist any pending edits first so the test hits the intended config.
    if (dirty) await handleSave();
    setResult(await test(id));
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[9px] uppercase tracking-widest text-on-surface-variant">
            API Key
          </span>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={view.hasKey ? `configured · ${view.keyHint}` : "sk-…"}
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
            placeholder={view.model}
            className="w-full bg-surface-container px-3 py-2 text-xs tui-border outline-none focus:border-accent-teal"
            spellCheck={false}
          />
        </label>
      </div>

      {(showBaseUrl || isCustom) && (
        <label className="block">
          <span className="mb-1 block text-[9px] uppercase tracking-widest text-on-surface-variant">
            Base URL
          </span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="w-full bg-surface-container px-3 py-2 text-xs tui-border outline-none focus:border-accent-teal"
            spellCheck={false}
          />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button className="tui-btn" disabled={busy || !dirty} onClick={handleSave}>
          {saved ? "SAVED ✓" : "SAVE_KEY"}
        </button>
        <button
          className="tui-btn"
          disabled={busy || (!view.hasKey && !key.trim())}
          onClick={handleTest}
        >
          TEST_CONNECTION
        </button>
        {view.docs && (
          <a
            href={view.docs}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-accent-teal hover:underline"
          >
            <Icon name="open_in_new" className="text-[13px]" /> Get_Key
          </a>
        )}
      </div>

      {result && (
        <div
          className={clsx(
            "flex items-center gap-2 p-2 text-[11px] tui-border",
            result.ok
              ? "border-accent-teal/40 text-accent-teal"
              : "border-terracotta/40 text-terracotta"
          )}
        >
          <Icon name={result.ok ? "check_circle" : "error"} className="text-[14px]" />
          <span>{result.message}</span>
        </div>
      )}
    </div>
  );
}
