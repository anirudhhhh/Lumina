import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Icon } from "@/components/primitives";
import { useChatStore } from "@/store/useChatStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useAnalysisStore } from "@/store/useAnalysisStore";
import { chat as chatApi } from "@/lib/api";
import type { ProviderId } from "@/lib/types";

const HELP = `Lumina analyst chat — ask about a vulnerability, a loaded sample, or malware TTPs.
Available commands:
  /help              show this help
  /clear             clear the conversation
  /model <name>      set the model for the active provider
  /provider <id>     switch active provider (openai|gemini|openrouter|custom)
  /providers         list providers and key status
  /context on|off    include/exclude the loaded report as evidence
  /report            print a summary of the currently loaded report
  /settings          open the Settings page
Plain text (no leading '/') is sent to the model.`;

export default function Chat() {
  const nav = useNavigate();
  const { lines, thinking, includeContext, push, clear, setThinking, setIncludeContext, history } =
    useChatStore();
  const { settings, load, setActiveProvider, saveProvider } = useSettingsStore();
  const health = useAnalysisStore((s) => s.health);
  const currentApk = useAnalysisStore((s) => s.currentApk);
  const report = useAnalysisStore((s) => s.report);

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!settings) load();
    if (lines.length === 0) push("system", HELP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines, thinking]);

  async function handleCommand(raw: string) {
    const [cmd, ...rest] = raw.slice(1).trim().split(/\s+/);
    const arg = rest.join(" ");
    switch (cmd) {
      case "help":
        push("system", HELP);
        break;
      case "clear":
      case "reset":
        clear();
        push("system", "Conversation cleared.");
        break;
      case "model":
        if (!arg) return push("system", "Usage: /model <name>");
        if (settings) {
          await saveProvider(settings.activeProvider, { model: arg });
          push("system", `Model for ${settings.activeProvider} set to '${arg}'.`);
        }
        break;
      case "provider": {
        const valid: ProviderId[] = ["openai", "gemini", "openrouter", "custom"];
        if (!valid.includes(arg as ProviderId))
          return push("system", `Unknown provider. One of: ${valid.join(", ")}`);
        await setActiveProvider(arg as ProviderId);
        push("system", `Active provider → ${arg}.`);
        break;
      }
      case "providers":
        if (settings) {
          const list = (Object.keys(settings.providers) as ProviderId[])
            .map((id) => {
              const p = settings.providers[id];
              const active = id === settings.activeProvider ? " *ACTIVE*" : "";
              return `  ${id.padEnd(11)} ${p.hasKey ? "[key set]" : "[no key ]"}  ${p.model}${active}`;
            })
            .join("\n");
          push("system", "Providers:\n" + list);
        }
        break;
      case "context":
        if (arg === "on" || arg === "off") {
          setIncludeContext(arg === "on");
          push("system", `Report context ${arg === "on" ? "enabled" : "disabled"}.`);
        } else {
          push("system", "Usage: /context on|off");
        }
        break;
      case "report":
        if (!report) push("system", "No report loaded. Analyze an artifact first.");
        else
          push(
            "system",
            `Loaded: ${report.meta.fileName}\n` +
              `Verdict: ${report.risk.verdict} (score ${report.risk.score})\n` +
              `Findings: ${report.static.findings.length}, IoCs: ${report.static.iocs.length}\n` +
              (report.ai ? `Intent: ${report.ai.intent}` : "AI synthesis: none")
          );
        break;
      case "settings":
        nav("/settings");
        break;
      default:
        push("system", `Unknown command: /${cmd}. Type /help.`);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");

    if (text.startsWith("/")) {
      push("user", text);
      await handleCommand(text);
      return;
    }

    push("user", text);
    const msgs = history();
    setThinking(true);
    try {
      const apkId = includeContext ? currentApk?.id ?? null : null;
      const res = await chatApi(msgs, apkId);
      push("assistant", res.reply);
    } catch (e) {
      push("system", `error: ${String(e)}`);
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  }

  const noKey = health && !health.llm;

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container-low px-4 text-[11px]">
        <span className="text-on-surface-variant">&gt; ANALYST_CHAT / INTERACTIVE_SHELL</span>
        <div className="flex items-center gap-4">
          <span className={clsx(includeContext ? "text-accent-teal" : "text-outline")}>
            CTX: {includeContext ? (currentApk ? currentApk.id : "no_target") : "off"}
          </span>
          <span className="text-tertiary">
            {health?.provider ?? "—"} · {health?.model ?? "—"}
          </span>
        </div>
      </div>

      {noKey && (
        <div className="flex items-center justify-between gap-2 border-b border-terracotta/40 bg-terracotta/10 px-4 py-2 text-[11px] text-terracotta">
          <span className="flex items-center gap-2">
            <Icon name="warning" className="text-[14px]" />
            No LLM key configured — chat will fail until you add one.
          </span>
          <button onClick={() => nav("/settings")} className="underline hover:text-on-surface">
            OPEN_SETTINGS
          </button>
        </div>
      )}

      {/* transcript */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-black/20 p-4 text-[13px] leading-relaxed">
        {lines.map((l, i) => (
          <Line key={i} role={l.role} content={l.content} />
        ))}
        {thinking && (
          <div className="flex items-center gap-2 text-accent-teal">
            <Icon name="progress_activity" className="animate-spin text-base" />
            <span className="animate-pulse-soft">analyzing…</span>
          </div>
        )}
      </div>

      {/* input */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-t border-outline-variant bg-surface-container-low px-4">
        <span className="text-accent-teal">&gt;</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about a vulnerability, or type /help…"
          className="flex-1 bg-transparent text-[13px] text-on-surface outline-none placeholder:text-outline"
          autoFocus
          spellCheck={false}
        />
        <button
          onClick={send}
          disabled={thinking || !input.trim()}
          className="text-[11px] font-bold uppercase tracking-widest text-accent-teal disabled:opacity-30 hover:underline"
        >
          SEND ↵
        </button>
      </div>
    </div>
  );
}

function Line({ role, content }: { role: "user" | "assistant" | "system"; content: string }) {
  if (role === "user") {
    return (
      <div className="flex gap-2">
        <span className="shrink-0 font-bold text-accent-teal">&gt;</span>
        <span className="whitespace-pre-wrap text-on-surface">{content}</span>
      </div>
    );
  }
  if (role === "system") {
    return (
      <pre className="whitespace-pre-wrap border-l-2 border-outline/40 pl-3 text-[12px] text-on-surface-variant">
        {content}
      </pre>
    );
  }
  return (
    <div className="flex gap-2">
      <span className="shrink-0 font-bold text-sage">◆</span>
      <span className="whitespace-pre-wrap text-on-surface/90">{content}</span>
    </div>
  );
}
