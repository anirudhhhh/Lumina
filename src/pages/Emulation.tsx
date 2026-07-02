import { useEffect, useState } from "react";
import clsx from "clsx";
import { Icon, Module } from "@/components/primitives";
import { useAnalysisStore } from "@/store/useAnalysisStore";
import { listDevices } from "@/lib/api";
import { mockRuntimeEvents } from "@/lib/mock";
import type { RuntimeEvent } from "@/lib/types";

export default function Emulation() {
  const { report, runtimeEvents, runDynamic, busy, stage } = useAnalysisStore();
  const [devices, setDevices] = useState<string[]>([]);
  const hooks = report?.ai?.hooks ?? [];

  useEffect(() => {
    listDevices().then(setDevices);
  }, []);

  // In browser preview there is no live event stream — show mock trace.
  const events: RuntimeEvent[] =
    runtimeEvents.length > 0 ? runtimeEvents : mockRuntimeEvents();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container-low px-4 text-[11px]">
        <span className="text-on-surface-variant">
          &gt; SECURE_EMULATION / FRIDA_RUNTIME_MONITOR
        </span>
        <span className="text-tertiary">
          KERNEL: EMULATOR-X86_64 | {devices.length} DEVICE(S)
        </span>
      </div>

      <div className="grid flex-1 grid-cols-12 gap-6 overflow-y-auto p-6">
        {/* Left: hooks + devices */}
        <div className="col-span-12 space-y-6 lg:col-span-5">
          <Module label="GENERATED_FRIDA_HOOKS" labelColor="text-sage">
            <div className="space-y-2">
              {hooks.length === 0 && (
                <div className="py-6 text-center text-xs text-on-surface-variant">
                  No hooks generated. Run static analysis + AI synthesis first.
                </div>
              )}
              {hooks.map((h) => (
                <div key={h.id} className="tui-border bg-surface p-3">
                  <div className="flex items-center gap-2 text-[11px] font-bold text-sage">
                    <Icon name="my_location" className="text-[14px]" />
                    {h.targetClass}.{h.targetMethod}()
                  </div>
                  <div className="mt-1 text-[10px] text-on-surface-variant">{h.reason}</div>
                </div>
              ))}
            </div>
          </Module>

          <Module label="ISOLATED_ENVIRONMENT">
            <div className="space-y-3 text-[11px]">
              <Row k="Sandbox" v="Android VM (Frida server active)" ok />
              <Row k="Devices" v={devices[0] ?? "none attached"} ok={devices.length > 0} />
              <Row k="Network" v="TAP capture → IoC validation" ok />
              <Row k="Snapshot" v="Clean baseline @ boot" ok />
            </div>
            <div className="mt-4 flex gap-3">
              <button
                className="tui-btn flex-1"
                disabled={busy || !report}
                onClick={() => runDynamic()}
              >
                {stage === "DYNAMIC_EMULATION" ? "MONITORING…" : "START_EMULATION"}
              </button>
            </div>
          </Module>
        </div>

        {/* Right: live runtime trace */}
        <div className="col-span-12 flex flex-col lg:col-span-7">
          <div className="flex flex-1 flex-col overflow-hidden tui-border">
            <div className="flex h-8 items-center justify-between border-b border-outline-variant bg-surface-container px-4 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse bg-tertiary" />
                <span>RUNTIME_TRACE: PID_4892</span>
              </div>
              <button className="text-[10px] text-tertiary hover:underline">SAVE_LOG</button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-black/30 p-4 text-[12px]">
              {events.map((e, i) => (
                <TraceLine key={i} e={e} />
              ))}
              <div className="mt-4 animate-pulse text-outline">
                _ SYSTEM_LISTENING_FOR_HOOKS...
              </div>
            </div>
            <div className="flex h-10 items-center justify-center gap-6 border-t border-outline-variant bg-surface-container-low">
              <button className="flex items-center gap-1 text-[11px] text-tertiary hover:text-on-surface" onClick={() => runDynamic()}>
                <Icon name="play_arrow" className="text-[18px]" /> RUN
              </button>
              <button className="flex items-center gap-1 text-[11px] text-error hover:text-on-surface">
                <Icon name="stop" className="text-[18px]" /> STOP
              </button>
              <button className="flex items-center gap-1 text-[11px] text-outline hover:text-on-surface">
                <Icon name="refresh" className="text-[18px]" /> RESET
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-on-surface-variant">{k}</span>
      <span className={clsx("flex items-center gap-1", ok ? "text-tertiary" : "text-outline")}>
        <Icon name={ok ? "check_circle" : "radio_button_unchecked"} className="text-[14px]" />
        {v}
      </span>
    </div>
  );
}

function TraceLine({ e }: { e: RuntimeEvent }) {
  if (e.kind === "NETWORK" || e.severity === "CRITICAL") {
    return (
      <div className="tui-border border-error/30 bg-error/10 p-2">
        <div className="flex items-center gap-2 text-[11px] font-bold text-error">
          <Icon name="wifi_tethering" className="text-[14px]" />
          {e.message}
        </div>
        {e.detail && <div className="mt-1 text-on-surface">{e.detail}</div>}
      </div>
    );
  }
  if (e.kind === "CALL") {
    return (
      <div className="border-l-2 border-tertiary/50 pl-3">
        <div className="font-bold text-tertiary">&gt;&gt;&gt; CALL: {e.message}</div>
        {e.detail && <div className="text-[10px] text-on-surface-variant">ARGS: {e.detail}</div>}
      </div>
    );
  }
  return (
    <div className="text-outline">
      {e.ts} [{e.kind}] {e.message}
    </div>
  );
}
