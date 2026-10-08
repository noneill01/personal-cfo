"use client";

import { useState } from "react";
import type { Snapshot } from "../lib/types";

type MetricKey = "totalWealth" | "netWorth" | "debt";

export default function BalanceHistory({snapshots, format}: {snapshots: Snapshot[]; format: (value: number) => string}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

  if (!ordered.length) return <section className="balance-history empty-state"><strong>No balance history yet</strong><span>Save a balance update and this view will start tracking progress.</span></section>;

  const width = 820, height = 320, pad = {left: 92, right: 24, top: 28, bottom: 52};
  const metricValue = (snapshot: Snapshot, key: MetricKey) => key === "totalWealth" ? snapshot.netWorth + snapshot.debt : snapshot[key];
  const metricKeys: MetricKey[] = ["totalWealth", "netWorth", "debt"];
  const values = ordered.flatMap(snapshot => metricKeys.map(key => metricValue(snapshot, key)));
  const low = Math.min(...values), high = Math.max(...values), spread = Math.max(high - low, 1);
  const min = low - spread * 0.08, max = high + spread * 0.08;
  const x = (index: number) => ordered.length === 1 ? width / 2 : pad.left + (index / (ordered.length - 1)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - (value - min) / (max - min)) * (height - pad.top - pad.bottom);
  const points = (key: MetricKey) => ordered.map((snapshot, index) => `${x(index).toFixed(1)},${y(metricValue(snapshot, key)).toFixed(1)}`).join(" ");
  const lines = [
    {key: "totalWealth" as const, label: "Total wealth", colour: "#6c8cff"},
    {key: "netWorth" as const, label: "Net worth", colour: "#20b486"},
    {key: "debt" as const, label: "Total debt", colour: "#ef5b67"},
  ];
  const change = (key: MetricKey) => ordered.length > 1 ? metricValue(ordered.at(-1)!, key) - metricValue(ordered[0], key) : 0;
  const fullDate = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("en-GB", {day: "numeric", month: "long", year: "numeric"});
  const dateLabel = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("en-GB", {month: "short", year: "2-digit"});
  const activeSnapshot = hoveredIndex === null ? null : ordered[hoveredIndex];
  const tooltipX = activeSnapshot && x(hoveredIndex!) > width - 270 ? x(hoveredIndex!) - 244 : x(hoveredIndex!) + 16;
  const tooltipY = pad.top + 16;

  return <section className="balance-history" aria-labelledby="balance-history-title">
    <div className="balance-history-head"><div><span className="insight-label">PROGRESS OVER TIME</span><h3 id="balance-history-title">Wealth and debt history</h3><p>Total wealth is every asset (property, pensions, savings and investments). Net worth subtracts debt. Only saved balance snapshots appear here.</p></div><div className="balance-history-period"><strong>{ordered.length}</strong><span>snapshot{ordered.length === 1 ? "" : "s"}</span></div></div>
    <div className="balance-history-legend" aria-label={activeSnapshot ? `Balances on ${fullDate(activeSnapshot.date)}` : "Change since the first saved snapshot"}>{lines.map(line => <span key={line.key}><i style={{background: line.colour}} />{line.label}<b>{activeSnapshot ? format(metricValue(activeSnapshot, line.key)) : `${change(line.key) >= 0 ? "+" : "−"}${format(Math.abs(change(line.key)))}`}</b></span>)}</div>
    <div className="balance-chart-meta"><strong>Amount (£)</strong><span>Vertical scale: {format(min)} to {format(max)}</span><small>{activeSnapshot ? `Showing: ${fullDate(activeSnapshot.date)}` : "Hover or tab through a date to inspect it"}</small></div>
    <div className="balance-chart-wrap">
      <svg className="balance-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Interactive balance history from ${ordered[0].date} to ${ordered.at(-1)!.date}. Hover or tab through dates for exact values.`} onPointerLeave={() => setHoveredIndex(null)}>
        {[0, .25, .5, .75, 1].map(ratio => <g key={ratio}><line x1={pad.left} x2={width - pad.right} y1={pad.top + ratio * (height - pad.top - pad.bottom)} y2={pad.top + ratio * (height - pad.top - pad.bottom)} className="balance-chart-grid" /><text x={pad.left - 12} y={pad.top + ratio * (height - pad.top - pad.bottom) + 5} textAnchor="end" className="balance-chart-axis">{format(max - (max - min) * ratio)}</text></g>)}
        <text x={16} y={height / 2} textAnchor="middle" className="balance-chart-axis-title" transform={`rotate(-90 16 ${height / 2})`}>Amount (£)</text>
        {lines.map(line => <polyline key={line.key} points={points(line.key)} fill="none" stroke={line.colour} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />)}
        {ordered.map((snapshot, index) => {
          const start = index === 0 ? pad.left : (x(index - 1) + x(index)) / 2;
          const end = index === ordered.length - 1 ? width - pad.right : (x(index) + x(index + 1)) / 2;
          return <rect key={snapshot.date} className="balance-chart-hit-area" x={start} y={pad.top} width={end - start} height={height - pad.top - pad.bottom} tabIndex={0} aria-label={`Show balances for ${fullDate(snapshot.date)}`} onPointerEnter={() => setHoveredIndex(index)} onFocus={() => setHoveredIndex(index)} onBlur={() => setHoveredIndex(null)} />;
        })}
        {activeSnapshot && <line className="balance-chart-crosshair" x1={x(hoveredIndex!)} x2={x(hoveredIndex!)} y1={pad.top} y2={height - pad.bottom} />}
        {ordered.map((snapshot, index) => <g key={snapshot.date}><text x={x(index)} y={height - 20} textAnchor="middle" className="balance-chart-axis">{dateLabel(snapshot.date)}</text>{lines.map(line => <circle key={line.key} className={hoveredIndex === index ? "balance-chart-point active" : "balance-chart-point"} cx={x(index)} cy={y(metricValue(snapshot, line.key))} r={hoveredIndex === index ? "7" : "5"} fill={line.colour} stroke="var(--card)" strokeWidth="2" />)}</g>)}
        {activeSnapshot && <g className="balance-chart-tooltip" transform={`translate(${tooltipX} ${tooltipY})`} aria-hidden="true"><rect width="228" height="112" rx="10" /><text x="14" y="23" className="tooltip-date">{fullDate(activeSnapshot.date)}</text>{lines.map((line, index) => <text key={line.key} x="14" y={48 + index * 21} className="tooltip-value"><tspan fill={line.colour}>●</tspan><tspan dx="7">{line.label}: {format(metricValue(activeSnapshot, line.key))}</tspan></text>)}</g>}
        <text x={width / 2} y={height - 2} textAnchor="middle" className="balance-chart-axis-title">Snapshot date</text>
      </svg>
      <p className="sr-only" aria-live="polite">{activeSnapshot ? `Balances for ${fullDate(activeSnapshot.date)}: total wealth ${format(metricValue(activeSnapshot, "totalWealth"))}, net worth ${format(activeSnapshot.netWorth)}, total debt ${format(activeSnapshot.debt)}.` : "Hover or tab through a chart date to hear exact balances."}</p>
    </div>
    <details className="chart-data"><summary>View exact balance history</summary><div className="table-wrap"><table><thead><tr><th>Date</th><th>Total wealth</th><th>Net worth</th><th>Total debt</th><th>Cash after cards</th></tr></thead><tbody>{ordered.map(snapshot => <tr key={snapshot.date}><td>{fullDate(snapshot.date)}</td><td>{format(metricValue(snapshot, "totalWealth"))}</td><td>{format(snapshot.netWorth)}</td><td>{format(snapshot.debt)}</td><td>{format(snapshot.cash)}</td></tr>)}</tbody></table></div></details>
  </section>;
}
