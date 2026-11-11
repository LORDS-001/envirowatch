import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { Drawer } from "@/components/ui/Drawer";
import { TextField } from "@/components/ui/Field";
import { KeyReveal } from "@/components/ui/KeyReveal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ToastViewport, toast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";

const meta: Meta = { title: "Overlays" };
export default meta;
type Story = StoryObj;

function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Register device
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Register device"
        description="The device key is shown once, right after you register."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Register device
            </Button>
          </>
        }
      >
        <TextField label="Device ID" mono defaultValue="sensor-1001" />
      </Dialog>
    </>
  );
}

export const DialogStory: Story = { name: "Dialog", render: () => <DialogDemo /> };

function ConfirmDemo({ failing }: { failing?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Deactivate sensor-207
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Deactivate sensor-207?"
        description="It stops being accepted at ingestion. Its history stays."
        confirmLabel="Deactivate device"
        variant="destructive"
        error={failing ? "The server didn’t respond. Try again." : null}
        onConfirm={() => setOpen(false)}
      />
    </>
  );
}

export const Confirm: Story = { name: "ConfirmDialog", render: () => <ConfirmDemo /> };
export const ConfirmError: Story = { name: "ConfirmDialog with error", render: () => <ConfirmDemo failing /> };

function DrawerDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open alert</Button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        label="Alert: PM2.5 above 35 µg/m³ at Apapa Port"
        title="PM2.5 above 35 µg/m³ for 10 min"
        header={<StatusBadge status="active" />}
        footer={
          <Button variant="primary" onClick={() => setOpen(false)}>
            Acknowledge alert
          </Button>
        }
      >
        <p className="text-body text-fg-secondary">Timeline, context chart and nearby sensors go here.</p>
      </Drawer>
    </>
  );
}

export const DrawerStory: Story = { name: "Drawer", render: () => <DrawerDemo /> };

export const Toasts: Story = {
  name: "Toast",
  render: () => (
    <div className="flex gap-2">
      <Button onClick={() => toast({ title: "Alert acknowledged", description: "Operators on call were told." })}>Show success</Button>
      <Button onClick={() => toast({ title: "Couldn’t save the rule", description: "The threshold must be a number.", tone: "error" })}>
        Show error
      </Button>
      <ToastViewport />
    </div>
  ),
};

export const Key: Story = {
  name: "KeyReveal",
  render: () => (
    <div className="max-w-lg">
      <KeyReveal deviceId="sensor-1001" apiKey="ewk_live_7Q2mX9pLr4TzV8bN3cJ6hD1fK5sW0yA" />
    </div>
  ),
};

export const TooltipStory: Story = {
  name: "Tooltip",
  render: () => (
    <Tooltip content="Received 08:32:10 WAT, 1 s after it was measured">
      <button type="button" className="num rounded-sm text-data text-fg underline decoration-dotted">
        08:32:09 WAT
      </button>
    </Tooltip>
  ),
};
