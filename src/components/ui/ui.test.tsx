import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { QualityFlag } from "./QualityFlag";
import { StatusBadge, type BadgeStatus } from "./StatusBadge";

const ALL: BadgeStatus[] = ["pending", "active", "acknowledged", "resolved", "online", "silent", "drifting", "suspicious", "deactivated"];

describe("StatusBadge", () => {
  it.each(ALL)("renders an icon and a word for %s (never colour alone)", (status) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent?.trim().length).toBeGreaterThan(0);
  });

  it("uses the fixed shape per state: Active is an octagon, Pending a triangle", () => {
    const { container: active } = render(<StatusBadge status="active" />);
    const { container: pending } = render(<StatusBadge status="pending" />);
    expect(active.querySelector("path")?.getAttribute("d")).toMatch(/^M4\.1/);
    expect(pending.querySelector("path")?.getAttribute("d")).toMatch(/^M6 1 11/);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });
});

describe("QualityFlag", () => {
  const base = { reason: null, ageMs: 5_000 };

  it("is silent for valid readings unless asked", () => {
    const { container } = render(<QualityFlag quality={{ ...base, status: "valid" }} />);
    expect(container).toBeEmptyDOMElement();
    render(<QualityFlag quality={{ ...base, status: "valid" }} showValid />);
    expect(screen.getByText("Valid")).toBeInTheDocument();
  });

  it("says stale with the age", () => {
    render(<QualityFlag quality={{ ...base, status: "stale", ageMs: 12 * 60_000 }} />);
    expect(screen.getByText("Stale · 12 min")).toBeInTheDocument();
  });

  it("gives the reason for suspicious and quarantined", () => {
    render(<QualityFlag quality={{ ...base, status: "suspicious", reason: "spike +340 %" }} />);
    render(<QualityFlag quality={{ ...base, status: "quarantined", reason: "clock error" }} />);
    expect(screen.getByText("Suspicious · spike +340 %")).toBeInTheDocument();
    expect(screen.getByText("Quarantined · clock error")).toBeInTheDocument();
  });

  it("labels estimates and late arrivals", () => {
    render(<QualityFlag quality={{ ...base, status: "estimated" }} />);
    render(<QualityFlag quality={{ ...base, status: "valid", lateByMs: 180_000 }} />);
    expect(screen.getByText("Estimated")).toBeInTheDocument();
    expect(screen.getByText("Arrived 3 min late")).toBeInTheDocument();
  });
});

describe("ChartFrame", () => {
  it("toggles between the chart and the same data as a table", async () => {
    const user = userEvent.setup();
    render(
      <ChartFrame
        title="PM2.5 by hour"
        summary="Latest 21.0 µg/m³"
        rows={[{ hour: "14:00", value: "21.0 µg/m³" }]}
        rowKey={(r) => r.hour}
        columns={[
          { header: "Hour", cell: (r) => r.hour },
          { header: "Mean", numeric: true, cell: (r) => r.value },
        ]}
      >
        <div>chart body</div>
      </ChartFrame>,
    );
    expect(screen.getByText("chart body")).toBeInTheDocument();
    expect(screen.getByText("Latest 21.0 µg/m³")).toHaveClass("sr-only");

    await user.click(screen.getByRole("button", { name: "View as table" }));
    expect(screen.queryByText("chart body")).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "PM2.5 by hour" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "21.0 µg/m³" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View as chart" })).toHaveAttribute("aria-pressed", "true");
  });
});
