import { create } from "zustand";
import type { ChatMessage } from "@/lib/types";

// A chat line: real conversation turns (user/assistant) plus local "system"
// lines emitted by slash-commands (help text, notices). Only user/assistant
// turns are sent to the backend LLM.
export interface ChatLine {
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
}

interface ChatState {
  lines: ChatLine[];
  thinking: boolean;
  includeContext: boolean;
  push: (role: ChatLine["role"], content: string) => void;
  clear: () => void;
  setThinking: (v: boolean) => void;
  setIncludeContext: (v: boolean) => void;
  /** The user/assistant turns to send to the LLM (drops local system lines). */
  history: () => ChatMessage[];
}

// Monotonic counter — avoids Date.now() collisions for React keys.
let _seq = 0;

export const useChatStore = create<ChatState>((set, get) => ({
  lines: [],
  thinking: false,
  includeContext: true,

  push: (role, content) =>
    set((s) => ({ lines: [...s.lines, { role, content, ts: _seq++ }] })),

  clear: () => set({ lines: [] }),
  setThinking: (v) => set({ thinking: v }),
  setIncludeContext: (v) => set({ includeContext: v }),

  history: () =>
    get()
      .lines.filter((l) => l.role === "user" || l.role === "assistant")
      .map((l) => ({ role: l.role as "user" | "assistant", content: l.content })),
}));
