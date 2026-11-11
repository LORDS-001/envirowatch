import * as RT from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export const TooltipProvider = RT.Provider;

interface TooltipProps {
  content: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}

/** Inverse pill. Opens on hover and on keyboard focus. */
export function Tooltip({ content, side = "top", children }: TooltipProps) {
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={8}
          className="z-50 rounded-pill bg-surface-inverse px-3 py-1 text-label text-on-inverse shadow-overlay"
        >
          {content}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
