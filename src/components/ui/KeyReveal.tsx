import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "./Button";
import { StateIcon } from "./StateIcon";

/** A device key, shown exactly once, with a copy button and a plain warning. */
export function KeyReveal({ deviceId, apiKey }: { deviceId: string; apiKey: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 rounded-md bg-state-warn-subtle p-3 text-body text-fg">
        <StateIcon shape="triangle" size={12} className="mt-1 text-state-warn" />
        <span>
          Copy this key now. It won’t be shown again. If it’s lost, rotate the key for{" "}
          <span className="num text-data">{deviceId}</span> to issue a new one.
        </span>
      </p>
      <div className="flex items-center gap-2 rounded-md border border-line bg-sunken p-3">
        <code className="num min-w-0 flex-1 break-all text-data text-fg" aria-label="Device key">
          {apiKey}
        </code>
        <Button
          size="sm"
          onClick={() => void copy()}
          icon={copied ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : <Copy size={14} strokeWidth={1.5} aria-hidden="true" />}
        >
          {copied ? "Copied" : "Copy key"}
        </Button>
      </div>
      {failed && (
        <p role="alert" className="text-body-sm text-state-critical">
          Couldn’t copy automatically. Select the key and copy it by hand.
        </p>
      )}
    </div>
  );
}
