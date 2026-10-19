'use client';
import type { SourceSalesSummary } from '@/lib/management/source-sales';

const COLORS = ['#e3262e', '#f59e0b', '#d32f2f', '#d97706', '#b71c1c', '#fbbf24'];
const RACE_LIMIT = COLORS.length;
const money = (value: number) => `${value.toLocaleString('vi-VN')} đ`;
const compact = (value: number) => value >= 1e9 ? `${(value / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`
  : value >= 1e6 ? `${(value / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`
  : value >= 1e3 ? `${(value / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}k` : String(value);
const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

function leaderStory(lines: { name: string; progress: number[] }[], days: string[]) {
  let leader = -1, since = '', changes = 0;
  days.forEach((day, index) => {
    let best = -1;
    lines.forEach((line, position) => { if (line.progress[index] > 0 && (best < 0 || line.progress[index] > lines[best].progress[index])) best = position; });
    if (best < 0 || best === leader) return;
    if (leader >= 0) changes += 1;
    leader = best; since = day;
  });
  return leader < 0 ? null : { name: lines[leader].name, since, changes };
}

function seriesColor(key: string, rows: SourceSalesSummary['rows']) {
  const index = rows.filter(row => row.key).findIndex(row => row.key === key);
  return index >= 0 ? COLORS[index % COLORS.length] : '#94a3b8';
}

function ComparisonBars({ summary, unit }: { summary: SourceSalesSummary; unit: string }) {
  const max = Math.max(...summary.rows.map(row => row.rent), 1);
  const top = summary.rows.find(row => row.key)?.rent ?? 0;
  const keyed = summary.rows.filter(row => row.key);
  return <figure className="mg-sales-chart"><figcaption>So sánh tiền thuê theo {unit}</figcaption>
    <ol className="mg-sales-bars">{summary.rows.map((row, index) => {
      const color = seriesColor(row.key, summary.rows);
      return <li key={row.key || 'none'} className={row.key ? undefined : 'is-muted'}>
      <div className="mg-sales-bar-label"><span>{row.key ? `#${index + 1}` : '—'}</span><strong title={row.name}>{row.name}</strong></div>
      <div className="mg-sales-bar-track" role="img" aria-label={`${row.name}: tiền thuê ${money(row.rent)}, đã thu ${money(row.paid)}`}>
        <span className="mg-sales-bar-rent" style={{ width: `${(row.rent / max) * 100}%`, background: color, opacity: 0.28 }} />
        <span className="mg-sales-bar-paid" style={{ width: `${(Math.min(row.paid, row.rent) / max) * 100}%`, background: color }} />
      </div>
      <div className="mg-sales-bar-value"><b>{compact(row.rent)}</b>{row.key && index > 0 && top > row.rent && <small>kém #1 {compact(top - row.rent)}</small>}</div>
    </li>;
    })}</ol>
    <ul className="mg-sales-race-legend">{keyed.map(row => <li key={row.key}><span className="mg-sales-swatch" style={{ background: seriesColor(row.key, summary.rows) }} />{row.name}</li>)}</ul>
    <p className="mg-sales-chart-legend">Thanh đậm: đã thu tiền thuê · thanh nhạt: tiền thuê</p>
  </figure>;
}

function RaceChart({ summary, unit }: { summary: SourceSalesSummary; unit: string }) {
  const { days } = summary;
  const lines = summary.rows.filter(row => row.key && row.rent > 0).slice(0, RACE_LIMIT);
  if (!days.length || !lines.length) return null;
  const width = 640, height = 240, left = 56, right = 12, top = 12, bottom = 28;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const max = Math.max(...lines.map(line => line.progress[line.progress.length - 1] || 0), 1);
  const x = (index: number) => left + (days.length === 1 ? plotWidth / 2 : (index / (days.length - 1)) * plotWidth);
  const y = (value: number) => top + plotHeight - (value / max) * plotHeight;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(step => max * step);
  const labels = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])];
  const story = leaderStory(lines, days);
  return <figure className="mg-sales-chart"><figcaption>Tiến trình cộng dồn tiền thuê theo ngày bắt đầu thuê{summary.rows.filter(row => row.key).length > RACE_LIMIT ? ` (top ${RACE_LIMIT} ${unit})` : ''}</figcaption>
    {story && <p className="mg-sales-race-story">Dẫn đầu: <strong>{story.name}</strong> từ {dayLabel(story.since)}{story.changes ? ` · ${story.changes} lần đổi người dẫn đầu` : ' · chưa bị vượt'}</p>}
    <svg className="mg-sales-race" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Tiến trình cộng dồn tiền thuê của ${lines.map(line => line.name).join(', ')}`}>
      {ticks.map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="mg-sales-grid" /><text x={left - 6} y={y(tick) + 4} textAnchor="end" className="mg-sales-axis">{compact(Math.round(tick))}</text></g>)}
      {labels.map(index => <text key={index} x={x(index)} y={height - 8} textAnchor={index === 0 && days.length > 1 ? 'start' : index === days.length - 1 && days.length > 1 ? 'end' : 'middle'} className="mg-sales-axis">{dayLabel(days[index])}</text>)}
      {lines.map(line => <g key={line.key} style={{ color: seriesColor(line.key, summary.rows) }}>
        <polyline points={line.progress.map((value, day) => `${x(day)},${y(value)}`).join(' ')} className="mg-sales-line" />
        <circle cx={x(days.length - 1)} cy={y(line.progress[days.length - 1])} r={4} className="mg-sales-dot"><title>{`${line.name}: ${money(line.progress[days.length - 1])}`}</title></circle>
      </g>)}
    </svg>
    <ul className="mg-sales-race-legend">{lines.map(line => <li key={line.key}><span className="mg-sales-swatch" style={{ background: seriesColor(line.key, summary.rows) }} />{line.name}<b>{compact(line.rent)}</b></li>)}</ul>
  </figure>;
}

export function SalesCharts({ summary, unit }: { summary: SourceSalesSummary; unit: string }) {
  if (!summary.rows.length) return null;
  return <div className="mg-sales-charts"><ComparisonBars summary={summary} unit={unit} /><RaceChart summary={summary} unit={unit} /></div>;
}
