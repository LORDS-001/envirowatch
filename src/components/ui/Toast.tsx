import * as RT from "@radix-ui/react-toast";
import { Check, X } from "lucide-react";
import { create } from "zustand";
import { StateIcon } from "./StateIcon";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: "success" | "error";
}

interface ToastState {
  items: ToastItem[];
  show: (t: Omit<ToastItem, "id" | "tone"> & { tone?: ToastItem["tone"] }) => void;
  dismiss: (id: number) => void;
}

let next = 0;

export const useToast = create<ToastState>((set) => ({
  items: [],
  show: (t) => set((s) => ({ items: [...s.items, { id: ++next, tone: "success", ...t }] })),
  dismiss: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));

/** One action, one confirmation in the same words: "Acknowledge alert" → "Alert acknowledged". */
export const toast = (t: Parameters<ToastState["show"]>[0]) => useToast.getState().show(t);

export function ToastViewport() {
  const items = useToast((s) => s.items);
  const dismiss = useToast((s) => s.dismiss);
  return (
    <RT.Provider swipeDirection="right" duration={5000}>
      {items.map((t) => (
        <RT.Root
          key={t.id}
          type={t.tone === "error" ? "foreground" : "background"}
          onOpenChange={(open) => !open && dismiss(t.id)}
          className="flex items-start gap-3 rounded-lg bg-surface-2 p-4 shadow-overlay"
        >
          {t.tone === "error" ? (
            <StateIcon shape="octagon" size={12} className="mt-1 text-state-critical" />
          ) : (
            <Check size={16} strokeWidth={2} className="mt-0 shrink-0 text-brand" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <RT.Title className="text-body font-medium text-fg">{t.title}</RT.Title>
            {t.description && <RT.Description className="mt-1 text-body-sm text-fg-secondary">{t.description}</RT.Description>}
          </div>
          <RT.Close aria-label="Dismiss" className="rounded-pill p-1 text-fg-muted hover:text-fg">
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
          </RT.Close>
        </RT.Root>
      ))}
      <RT.Viewport className="fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2 outline-none" />
    </RT.Provider>
  );
}
