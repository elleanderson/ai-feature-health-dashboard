import './styles/main.scss';
import {
  Chart, BarController, BarElement, LineController, LineElement, PointElement, DoughnutController, ArcElement,
  CategoryScale, LinearScale, Filler, Tooltip, Legend, type ChartConfiguration, type ChartType,
} from 'chart.js';
import {
  generate, costPerConversation, dailyCost, mean, sum, topicShift, PRICES, ROUTED_SMALL_SHARE, TARGETS, TOPICS,
  type Day, type Strategy,
} from './data';
import { money, unitMoney, count, pct, secs, day, change } from './format';

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, DoughnutController, ArcElement,
  CategoryScale, LinearScale, Filler, Tooltip, Legend);

const C = {
  cream: '#F3EEE2', dim: 'rgba(243,238,226,0.62)', hair: 'rgba(243,238,226,0.12)',
  gold: '#CFB36A', bronze: '#A8842F', sage: '#7FA89A', rust: '#C7795F', pine: '#1E4A43',
};
Chart.defaults.color = C.dim;
Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
Chart.defaults.borderColor = C.hair;
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.tooltip.backgroundColor = '#0A1F1C';
Chart.defaults.plugins.tooltip.borderColor = C.gold;
Chart.defaults.plugins.tooltip.borderWidth = 1;

const ALL = generate(180);
const state = { range: 30, strategy: 'routed' as Strategy };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const charts = new Map<string, Chart<any>>();

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

function windowed(): { now: Day[]; before: Day[] } {
  const now = ALL.slice(-state.range);
  const before = ALL.slice(-state.range * 2, -state.range);
  return { now, before };
}

function draw<T extends ChartType>(id: string, config: ChartConfiguration<T>): void {
  charts.get(id)?.destroy();
  const canvas = document.getElementById(id) as HTMLCanvasElement;
  charts.set(id, new Chart(canvas, config));
}

function renderKpis(now: Day[], before: Day[]): void {
  const s = state.strategy;
  const tiles = [
    { k: 'Conversations', v: count(sum(now, (d) => d.conversations)), c: change(sum(now, (d) => d.conversations), sum(before, (d) => d.conversations)), good: 'up' },
    { k: 'Cost per Conversation', v: unitMoney(mean(now, (d) => costPerConversation(d, s))), c: change(mean(now, (d) => costPerConversation(d, s)), mean(before, (d) => costPerConversation(d, s))), good: 'down' },
    { k: 'Spend in Period', v: money(sum(now, (d) => dailyCost(d, s))), c: change(sum(now, (d) => dailyCost(d, s)), sum(before, (d) => dailyCost(d, s))), good: 'down' },
    { k: 'Slowest 5% Response', v: secs(mean(now, (d) => d.p95)), c: change(mean(now, (d) => d.p95), mean(before, (d) => d.p95)), good: 'down', alarm: mean(now, (d) => d.p95) > TARGETS.p95 },
    { k: 'Eval Pass Rate', v: pct(mean(now, (d) => d.evalPass)), c: change(mean(now, (d) => d.evalPass), mean(before, (d) => d.evalPass)), good: 'up', alarm: mean(now, (d) => d.evalPass) < TARGETS.evalPass },
    { k: 'Hallucination Rate', v: pct(mean(now, (d) => d.hallucination), 1), c: change(mean(now, (d) => d.hallucination), mean(before, (d) => d.hallucination)), good: 'down', alarm: mean(now, (d) => d.hallucination) > TARGETS.hallucination },
  ];
  $('#kpis').innerHTML = tiles.map((t) => {
    const tone = t.c.dir === 'flat' ? 'flat' : t.c.dir === t.good ? 'good' : 'bad';
    return `<div class="kpi${t.alarm ? ' alarm' : ''}"><p class="kpi-k">${t.k}</p><p class="kpi-v">${t.v}</p><p class="kpi-c ${tone}">${t.c.text}</p></div>`;
  }).join('');
}

function renderUsage(now: Day[]): void {
  const s = state.strategy;
  draw('c-usage', {
    type: 'bar',
    data: {
      labels: now.map((d) => day(d.date)),
      datasets: [
        { type: 'bar', label: 'Conversations', data: now.map((d) => d.conversations), backgroundColor: 'rgba(127,168,154,0.45)', borderRadius: 3, yAxisID: 'y' },
        { type: 'line', label: 'Daily spend (£)', data: now.map((d) => +dailyCost(d, s).toFixed(2)), borderColor: C.gold, backgroundColor: C.gold, pointRadius: 0, tension: 0.35, borderWidth: 2, yAxisID: 'y1' },
      ],
    },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        y: { beginAtZero: true, title: { display: true, text: 'Conversations' } },
        y1: { beginAtZero: true, position: 'right', grid: { display: false }, title: { display: true, text: 'Spend (£)' } },
      },
    },
  });
  const single = sum(now, (d) => dailyCost(d, 'single'));
  const routed = sum(now, (d) => dailyCost(d, 'routed'));
  $('#spend-sub').textContent = `${money(sum(now, (d) => dailyCost(d, s)))} over ${state.range} days, ${s === 'routed' ? 'with routing' : 'on one large model'}`;
  $('#spend-note').textContent = s === 'routed'
    ? `Routing saves ${money(single - routed)} in this period, ${pct(1 - routed / single)} of the bill, by sending routine conversations to a smaller model. Usage keeps growing, so the saving grows with it.`
    : `Every conversation goes to the large model. Switch to Routed to see what sending the routine ones to a smaller model would save: ${money(single - routed)} in this period.`;
}

function renderMix(): void {
  const routed = state.strategy === 'routed';
  const small = routed ? ROUTED_SMALL_SHARE : 0;
  draw('c-mix', {
    type: 'doughnut',
    data: {
      labels: [PRICES.small.label, PRICES.large.label],
      datasets: [{ data: [small, 1 - small].map((n) => +(n * 100).toFixed(0)), backgroundColor: [C.sage, C.gold], borderColor: '#0F2A26', borderWidth: 3 }],
    },
    options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed}%` } } } },
  });
  $('#mix-note').textContent = routed
    ? `${pct(ROUTED_SMALL_SHARE)} of conversations are routine enough for the small model. The large model is kept for the hard cases, where its quality earns its price.`
    : 'Everything goes to the large model. It is simple and safe, and it is the most expensive way to run this feature.';
}

function lineChart(id: string, now: Day[], series: { label: string; f: (d: Day) => number; color: string; fill?: boolean }[], target: { v: number; label: string }, asPct: boolean): void {
  draw(id, {
    type: 'line',
    data: {
      labels: now.map((d) => day(d.date)),
      datasets: [
        ...series.map((s) => ({ label: s.label, data: now.map((d) => +(s.f(d) * (asPct ? 100 : 1)).toFixed(2)), borderColor: s.color, backgroundColor: s.fill ? 'rgba(207,179,106,0.12)' : s.color, fill: !!s.fill, pointRadius: 0, tension: 0.35, borderWidth: 2 })),
        { label: target.label, data: now.map(() => target.v * (asPct ? 100 : 1)), borderColor: C.rust, borderDash: [5, 5], pointRadius: 0, borderWidth: 1.5 },
      ],
    },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } }, y: { beginAtZero: !asPct, ticks: { callback: (v) => (asPct ? `${v}%` : `${v}s`) } } },
    },
  });
}

function renderDrift(now: Day[]): void {
  const first = now.slice(0, 7);
  const last = now.slice(-7);
  draw('c-drift', {
    type: 'bar',
    data: {
      labels: TOPICS,
      datasets: [
        { label: 'First week', data: TOPICS.map((t) => +(mean(first, (d) => d.topics[t]) * 100).toFixed(1)), backgroundColor: 'rgba(243,238,226,0.22)', borderRadius: 3 },
        { label: 'Latest week', data: TOPICS.map((t) => +(mean(last, (d) => d.topics[t]) * 100).toFixed(1)), backgroundColor: C.gold, borderRadius: 3 },
      ],
    },
    options: { maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { position: 'bottom' } }, scales: { x: { ticks: { callback: (v) => `${v}%` } }, y: { grid: { display: false } } } },
  });
  const shift = topicShift(now, 'Redundancy');
  $('#drift-note').textContent = shift > 0.05
    ? `Redundancy questions are up ${pct(shift)} across the period. The coach was tuned on career gaps, so this is the moment to add redundancy cases to the evals before quality slips.`
    : 'The mix of topics is steady in this period. Drift is slow, so keep watching the longer view.';
  $('#alert-text').textContent = `Questions about redundancy are up ${pct(Math.max(shift, 0))} in this period. Add redundancy cases to the evals.`;
}

const QUEUE = [
  { when: 'Today, 09:14', topic: 'Redundancy', reason: 'Quoted a notice period the user never gave', status: 'Corrected' },
  { when: 'Today, 08:02', topic: 'Interview nerves', reason: 'Low mood detected, support signposted', status: 'Checked' },
  { when: 'Yesterday, 17:40', topic: 'Career gaps', reason: 'Asked three questions in one reply', status: 'Prompt fix logged' },
  { when: 'Yesterday, 11:25', topic: 'Elevator pitch', reason: 'Added a job title the user didn’t hold', status: 'Corrected' },
  { when: '21 Oct, 15:03', topic: 'Other', reason: 'Asked to write a full CV, coach declined', status: 'No action' },
];

function renderQueue(now: Day[]): void {
  $('#review-sub').textContent = `${count(sum(now, (d) => d.flagged))} replies flagged for a person to check in this period`;
  $('#queue').innerHTML = QUEUE.map((q) => `<tr><td>${q.when}</td><td>${q.topic}</td><td>${q.reason}</td><td><span class="pill">${q.status}</span></td></tr>`).join('');
}

function render(): void {
  const { now, before } = windowed();
  renderKpis(now, before);
  renderUsage(now);
  renderMix();
  lineChart('c-evals', now, [{ label: 'Pass rate', f: (d) => d.evalPass, color: C.gold, fill: true }], { v: TARGETS.evalPass, label: 'Target' }, true);
  lineChart('c-hall', now, [{ label: 'Hallucination rate', f: (d) => d.hallucination, color: C.sage }], { v: TARGETS.hallucination, label: 'Limit' }, true);
  lineChart('c-latency', now, [{ label: 'Median', f: (d) => d.p50, color: C.sage }, { label: 'Slowest 5%', f: (d) => d.p95, color: C.gold }], { v: TARGETS.p95, label: 'Target' }, false);
  renderDrift(now);
  renderQueue(now);
}

function wireControls(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-range]').forEach((b) => b.addEventListener('click', () => {
    state.range = Number(b.dataset.range);
    document.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-strategy]').forEach((b) => b.addEventListener('click', () => {
    state.strategy = b.dataset.strategy as Strategy;
    document.querySelectorAll('[data-strategy]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));
  $('#alert-x').addEventListener('click', () => $('#alert').remove());
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.side nav a')];
  links.forEach((a) => a.addEventListener('click', () => links.forEach((x) => x.classList.toggle('on', x === a))));
}

wireControls();
render();
