import type { Preview } from "@storybook/react-vite";
import "../src/design/global.css";
import { TooltipProvider } from "../src/components/ui/Tooltip";

const preview: Preview = {
  parameters: {
    layout: "padded",
    backgrounds: { disable: true },
    a11y: { test: "error" },
  },
  decorators: [
    (Story) => (
      <TooltipProvider delayDuration={200}>
        <div className="min-h-dvh bg-canvas p-6 text-fg">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default preview;
