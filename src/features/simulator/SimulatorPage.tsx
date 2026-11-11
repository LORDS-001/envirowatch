import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Pause, Play, Square } from "lucide-react";
import { api } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";
import type { SimEvent, SimFault, SimRun } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { config } from "@/lib/config";
import { evaluate } from "@/lib/evaluation";
import { formatNumber, formatPercent } from "@/lib/format";
import { BentoGrid, span } from "@/components/layout/BentoGrid";
import { usePageTitle } from "@/components/layout/AppShell";
import { DataTable, type ColumnDef } from "@/components/charts/DataTable";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { Checkbox, Segmented, TextField } from "@/components/ui/Field";
import { StateIcon } from "@/components/ui/StateIcon";
import { toast } from "@/components/ui/Toast";

export const FAULTS: Array<{ value: SimFault; label: string; detail: string }> = [
  { value: "duplicate", label: "Duplicate", detail: "Resend the same reading ID" },
  { value: "late", label: "Late or out of order", detail: "Delay or reorder delivery" },
  { value: "silent", label: "Missing or silent", detail: "Skip readings or stop a device" },
  { value: "clock_error", label: "Clock error", detail: "Shift the event timestamp" },
  { value: "spike", label: "Spike", detail: "Insert an abrupt abnormal value" },
  { value: "drift", label: "Drift", detail: "Increase bias over time" },
  { value: "network", label: "Network failure", detail: "Interrupt transmissions" },
];
const FAULT_LABEL = Object.fromEntries(FAULTS.map((f) => [f.value, f.label])) as Record<SimFault, string>;

type Scenario = SimRun["scenario"];

function hms(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function SimulatorPage() {
  usePageTitle("Simulator", "Inject faults with a fixed seed and measure what the pipeline catches.");
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["simulator"],
    queryFn: ({ signal }) => api.simulatorStatus(signal),
    refetchInterval: (q) => (q.state.data?.run?.status === "running" ? 1000 : false),
  });
  const run = status.data?.run ?? null;

  const [scenario, setScenario] = useState<Scenario>("fault_hour");
  const [seed, setSeed] = useState(String(config.simSeed));
  const [speed, setSpeed] = useState("60");
  const [faults, setFaults] = useState<SimFault[]>(["spike", "drift", "silent"]);
  const [confirmStop, setConfirmStop] = useState(false);

  const seedNum = Number(seed);
  const seedError = !(Number.isInteger(seedNum) && seedNum >= 0) ? "Whole number, 0 or more" : null;
  const faultsError = scenario === "custom" && faults.length === 0 ? "Choose at least one fault" : null;

  const start = useMutation({
    mutationFn: () => api.startSimulation({ scenario, seed: seedNum, faults: scenario === "custom" ? faults : [], speed: Number(speed) }),
    onSuccess: (r) => {
      qc.setQueryData(["simulator"], r);
      toast({ title: "Run started", description: `Seed ${seedNum}, ${Number(speed)}× speed` });
    },
  });
  const control = useMutation({
    mutationFn: (action: "pause" | "resume" | "stop") => api.controlSimulation(action),
    onSuccess: (r, action) => {
      qc.setQueryData(["simulator"], r);
      setConfirmStop(false);
      if (action === "stop") toast({ title: "Run stopped", description: "Faults still pending are counted as missed." });
    },
  });

  const active = run && (run.status === "running" || run.status === "paused");

  return (
    <BentoGrid>
      <Card className={cn(span(4), "p-6")} aria-labelledby="scenario-title">
        <CardHeader id="scenario-title" title="Scenario" subtitle="Same seed, same faults, same results." />
        <form
          noValidate
          className="mt-6 flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!seedError && !faultsError) start.mutate();
          }}
        >
          <fieldset className="flex flex-col gap-2" disabled={!!active}>
            <legend className="mb-2 text-label text-fg-secondary">Run</legend>
            {(
              [
                ["baseline", "Baseline", "30 simulated minutes, no injected faults. Measures false alerts."],
                ["fault_hour", "One-hour fault injection", "Every fault type, about 32 injections over 60 simulated minutes."],
                ["custom", "Custom mix", "Choose which faults to inject."],
              ] as const
            ).map(([value, label, detail]) => (
              <label
                key={value}
                htmlFor={`scenario-${value}`}
                className={cn(
                  "grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 rounded-md border p-3",
                  scenario === value ? "border-brand bg-brand-subtle" : "border-line hover:bg-surface-2",
                )}
              >
                <input id={`scenario-${value}`} type="radio" name="scenario" value={value} checked={scenario === value} onChange={() => setScenario(value)} className="row-span-2 mt-1 accent-brand" />
                <span className="text-body text-fg">{label}</span>
                <span className="text-body-sm text-fg-muted">{detail}</span>
              </label>
            ))}
          </fieldset>
          {scenario === "custom" && (
            <fieldset className="flex flex-col gap-3" disabled={!!active}>
              <legend className="mb-2 text-label text-fg-secondary">Faults</legend>
              {FAULTS.map((f) => (
                <Checkbox
                  key={f.value}
                  label={f.label}
                  description={f.detail}
                  checked={faults.includes(f.value)}
                  onCheckedChange={(v) => setFaults(v ? [...faults, f.value] : faults.filter((x) => x !== f.value))}
                />
              ))}
              {faultsError && <p role="alert" className="text-body-sm text-state-critical">{faultsError}</p>}
            </fieldset>
          )}
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Seed" mono inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value)} error={seedError} disabled={!!active} />
            <div className="flex flex-col gap-2">
              <span className="text-label text-fg-secondary">Speed</span>
              <Segmented
                label="Speed"
                value={speed}
                onChange={setSpeed}
                options={[
                  { value: "60", label: "60×" },
                  { value: "360", label: "360×" },
                ]}
              />
            </div>
          </div>
          {start.error && <p role="alert" className="text-body-sm text-state-critical">{errorMessage(start.error)}</p>}
          <Button type="submit" variant="primary" loading={start.isPending} disabled={!!active} icon={<Play size={16} strokeWidth={2} aria-hidden="true" />}>
            {run && !active ? "Start new run" : "Start run"}
          </Button>
        </form>
      </Card>

      <div className={cn(span(8), "flex flex-col gap-4")}>
        {status.error ? (
          <Card className="p-6">
            <ErrorState title="Couldn’t load the simulator" detail={errorMessage(status.error)} onRetry={() => void status.refetch()} />
          </Card>
        ) : status.isLoading ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : !run ? (
          <Card className="p-6">
            <EmptyState title="No run yet" description="Pick a scenario and start a run. Ground truth and detections appear here as it plays." />
          </Card>
        ) : (
          <>
            <SimulatorControl
              run={run}
              busy={control.isPending}
              onPause={() => control.mutate("pause")}
              onResume={() => control.mutate("resume")}
              onStop={() => setConfirmStop(true)}
            />
            <GroundTruth run={run} />
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmStop}
        onOpenChange={setConfirmStop}
        title="Stop this run?"
        description="The run ends now. Faults still waiting for detection count as missed, which lowers recall."
        confirmLabel="Stop run"
        variant="destructive"
        busy={control.isPending}
        error={control.error ? errorMessage(control.error) : null}
        onConfirm={() => control.mutate("stop")}
      />
    </BentoGrid>
  );
}

const STATUS_WORD: Record<SimRun["status"], string> = { running: "Running", paused: "Paused", stopped: "Stopped", completed: "Completed" };

function SimulatorControl({
  run,
  busy,
  onPause,
  onResume,
  onStop,
}: {
  run: SimRun;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}) {
  const e = evaluate(run);
  const progress = run.elapsed_s / run.duration_s;
  const active = run.status === "running" || run.status === "paused";
  const tiles: Array<[string, number, string]> = [
    ["Injected", e.injected, "Faults put into the stream"],
    ["Detected", e.detected, "Caught by the pipeline (TP)"],
    ["Missed", e.missed, "Not caught in time (FN)"],
    ["False alerts", e.falseAlerts, "Fired with no fault (FP)"],
  ];
  return (
    <Card className="p-6" aria-labelledby="run-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="run-title" className="text-h2 text-fg">
            {run.scenario === "baseline" ? "Baseline" : run.scenario === "fault_hour" ? "One-hour fault injection" : "Custom mix"}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-body-sm text-fg-muted">
            <span className="num inline-flex h-[22px] items-center rounded-pill bg-surface-2 px-2 text-data text-fg-secondary">seed {run.seed}</span>
            <span>{run.speed}× speed</span>
            <span aria-live="polite">{STATUS_WORD[run.status]}</span>
          </p>
        </div>
        {active && (
          <div className="flex gap-2">
            {run.status === "running" ? (
              <Button onClick={onPause} disabled={busy} icon={<Pause size={16} strokeWidth={1.5} aria-hidden="true" />}>
                Pause
              </Button>
            ) : (
              <Button onClick={onResume} disabled={busy} icon={<Play size={16} strokeWidth={1.5} aria-hidden="true" />}>
                Resume
              </Button>
            )}
            <Button variant="destructive" onClick={onStop} disabled={busy} icon={<Square size={14} strokeWidth={1.5} aria-hidden="true" />}>
              Stop
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-baseline justify-between">
        <span className="num text-reading-xl text-fg" aria-label={`Simulated time ${hms(run.elapsed_s)} of ${hms(run.duration_s)}`}>
          {hms(run.elapsed_s)}
        </span>
        <span className="num text-data text-fg-muted">of {hms(run.duration_s)} simulated</span>
      </div>
      <div
        role="progressbar"
        aria-label="Run progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-3"
      >
        <div className="h-full rounded-pill bg-fg-secondary transition-[width] duration-sweep ease-standard" style={{ width: `${progress * 100}%` }} />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(([label, value, note]) => (
          <div key={label} className="rounded-md bg-surface-2 p-4">
            <dt className="text-body-sm text-fg-secondary">{label}</dt>
            <dd>
              <span className="num text-reading-md text-fg">{value}</span>
              <span className="mt-1 block text-label text-fg-muted">{note}</span>
            </dd>
          </div>
        ))}
      </dl>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-line p-4">
          <dt className="text-body-sm text-fg-secondary">Recall</dt>
          <dd>
            <span className="num text-reading-xl text-fg">{e.recall === null ? "–" : formatPercent(e.recall, 1)}</span>
            <span className="mt-1 block text-body-sm text-fg-muted">
              TP / (TP + FN) = {e.detected} / {e.detected + e.missed}
              {e.pending ? `, ${e.pending} still pending` : ""}
            </span>
          </dd>
        </div>
        <div className="rounded-md border border-line p-4">
          <dt className="text-body-sm text-fg-secondary">Precision</dt>
          <dd>
            <span className="num text-reading-xl text-fg">{e.precision === null ? "–" : formatPercent(e.precision, 1)}</span>
            <span className="mt-1 block text-body-sm text-fg-muted">
              TP / (TP + FP) = {e.detected} / {e.detected + e.falseAlerts}
            </span>
          </dd>
        </div>
      </dl>
      {e.meanDelayS !== null && (
        <p className="mt-4 text-body-sm text-fg-secondary">Mean time to detect: {formatNumber(e.meanDelayS, 0)} s simulated.</p>
      )}
    </Card>
  );
}

type Row = (SimEvent & { kind: "fault" }) | { kind: "false"; id: string; device_id: string; fault_type: SimFault; injected_s: null; detected_s: number; outcome: "false" };

const OUTCOME = {
  detected: { shape: "circle", cls: "text-state-normal", word: "Detected" },
  missed: { shape: "octagon", cls: "text-state-critical", word: "Missed" },
  pending: { shape: "triangle", cls: "text-state-warn", word: "Pending" },
  false: { shape: "diamond", cls: "text-state-suspicious", word: "False alert" },
} as const;

function GroundTruth({ run }: { run: SimRun }) {
  // Chronological: false alerts sit where they fired, between the injected faults.
  const rows: Row[] = useMemo(
    () =>
      [
        ...run.events.map((e) => ({ ...e, kind: "fault" as const })),
        ...run.false_alerts.map((f) => ({ ...f, kind: "false" as const, injected_s: null, outcome: "false" as const })),
      ].sort((a, b) => (a.injected_s ?? a.detected_s ?? 0) - (b.injected_s ?? b.detected_s ?? 0)),
    [run],
  );
  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      { id: "id", header: "ID", accessorFn: (r) => r.id, cell: ({ getValue }) => <span className="num text-data">{getValue() as string}</span>, meta: { width: "80px" } },
      { id: "fault", header: "Fault", accessorFn: (r) => FAULT_LABEL[r.fault_type], meta: { width: "minmax(140px,1fr)" } },
      { id: "device", header: "Device", accessorFn: (r) => r.device_id, cell: ({ getValue }) => <span className="num text-data">{getValue() as string}</span>, meta: { width: "110px" } },
      { id: "injected", header: "Injected", accessorFn: (r) => r.injected_s ?? -1, cell: ({ row }) => (row.original.injected_s === null ? "–" : hms(row.original.injected_s)), meta: { numeric: true, width: "100px" } },
      { id: "detected", header: "Detected", accessorFn: (r) => r.detected_s ?? -1, cell: ({ row }) => (row.original.detected_s === null ? "–" : hms(row.original.detected_s)), meta: { numeric: true, width: "100px" } },
      {
        id: "delay",
        header: "Delay",
        accessorFn: (r) => (r.detected_s !== null && r.injected_s !== null ? r.detected_s - r.injected_s : -1),
        cell: ({ getValue }) => ((getValue() as number) < 0 ? "–" : `${getValue() as number} s`),
        meta: { numeric: true, width: "90px" },
      },
      {
        id: "outcome",
        header: "Outcome",
        accessorFn: (r) => r.outcome,
        cell: ({ row }) => {
          const o = OUTCOME[row.original.outcome];
          return (
            <span className={cn("inline-flex items-center gap-1 text-label", o.cls)}>
              <StateIcon shape={o.shape} size={10} />
              {o.word}
            </span>
          );
        },
        meta: { width: "130px" },
      },
    ],
    [],
  );

  function exportCsv() {
    const e = evaluate(run);
    const lines = [
      "# EnviroWatch fault-injection evaluation",
      `# Run ${run.id}, scenario ${run.scenario}, seed ${run.seed}, speed ${run.speed}x, status ${run.status}`,
      `# Simulated ${run.elapsed_s} of ${run.duration_s} s`,
      `# Injected ${e.injected}, detected ${e.detected}, missed ${e.missed}, pending ${e.pending}, false alerts ${e.falseAlerts}`,
      `# Recall TP/(TP+FN) = ${e.recall === null ? "n/a" : e.recall.toFixed(4)}; precision TP/(TP+FP) = ${e.precision === null ? "n/a" : e.precision.toFixed(4)}`,
      "id,kind,fault_type,device_id,injected_s,detected_s,delay_s,outcome",
      ...rows.map((r) =>
        [r.id, r.kind, r.fault_type, r.device_id, r.injected_s ?? "", r.detected_s ?? "", r.detected_s !== null && r.injected_s !== null ? r.detected_s - r.injected_s : "", r.outcome].join(","),
      ),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `envirowatch-evaluation-seed-${run.seed}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast({ title: "Evaluation report exported" });
  }

  return (
    <Card className="p-6" aria-labelledby="gt-title">
      <CardHeader
        id="gt-title"
        title="Ground truth against detections"
        subtitle="Every injected fault and what the pipeline did with it, plus alerts that fired with nothing injected"
        actions={
          <Button size="sm" onClick={exportCsv} disabled={rows.length === 0} icon={<Download size={14} strokeWidth={1.5} aria-hidden="true" />}>
            Export evaluation
          </Button>
        }
      />
      <div className="mt-4">
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          caption="Ground truth against detections"
          height={420}
          compact
          empty={{ title: "Nothing injected yet", description: "Faults appear here as the run reaches them." }}
        />
      </div>
    </Card>
  );
}
