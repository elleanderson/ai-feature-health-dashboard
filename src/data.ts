/**
 * Sample data for the dashboard.
 *
 * Everything here is generated, not real usage. It's shaped to behave like a
 * live AI coaching feature: weekday peaks, a slow drift in what people ask
 * about and a quality dip after a prompt change, so every panel has a story.
 * A seeded random generator keeps the numbers identical on every load.
 */

export type Strategy = 'single' | 'routed';

export interface Day {
  date: Date;
  conversations: number;
  tokensIn: number;      // average input tokens per conversation
  tokensOut: number;     // average output tokens per conversation
  p50: number;           // median response time, seconds
  p95: number;           // 95th percentile response time, seconds
  evalPass: number;      // share of eval cases passed, 0 to 1
  hallucination: number; // share of sampled replies with an invented claim, 0 to 1
  flagged: number;       // replies sent to human review
  topics: Record<Topic, number>; // share of conversations by topic
}

export type Topic = 'Career gaps' | 'Interview nerves' | 'Redundancy' | 'Elevator pitch' | 'Other';
export const TOPICS: Topic[] = ['Career gaps', 'Interview nerves', 'Redundancy', 'Elevator pitch', 'Other'];

/** Illustrative prices in pounds per million tokens. Not any vendor's price list. */
export const PRICES = {
  large: { input: 2.4, output: 12.0, label: 'Large model' },
  small: { input: 0.2, output: 1.0, label: 'Small model' },
} as const;

/** Under routing, this share of conversations goes to the small model. */
export const ROUTED_SMALL_SHARE = 0.78;

export const TARGETS = { evalPass: 0.8, hallucination: 0.02, p95: 6 };

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generate(days = 90, end = new Date(2026, 9, 23)): Day[] {
  const rand = mulberry32(20261023);
  const jitter = (n: number) => n * (1 + (rand() - 0.5) * 0.18);
  const out: Day[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(end);
    date.setDate(end.getDate() - i);
    const t = (days - 1 - i) / (days - 1);           // 0 at the start, 1 today
    const weekday = date.getDay();
    const weekFactor = weekday === 0 || weekday === 6 ? 0.62 : weekday === 1 ? 1.18 : 1;
    const growth = 1 + t * 0.9;
    const promptChange = t > 0.885 && t < 0.925; // about two to three weeks before today        // a prompt edit that briefly hurt quality

    const redundancy = 0.12 + t * 0.14;                // the slow drift
    const raw: Record<Topic, number> = {
      'Career gaps': 0.36 - t * 0.06,
      'Interview nerves': 0.24,
      Redundancy: redundancy,
      'Elevator pitch': 0.16 - t * 0.04,
      Other: 0.12 - t * 0.04,
    };
    const sum = Object.values(raw).reduce((a, b) => a + b, 0);
    const topics = Object.fromEntries(TOPICS.map((k) => [k, raw[k] / sum])) as Record<Topic, number>;

    const conversations = Math.round(jitter(140 * growth * weekFactor));
    const evalPass = Math.min(0.97, Math.max(0.4, (promptChange ? 0.64 : 0.84 + t * 0.05) + (rand() - 0.5) * 0.05));
    const hallucination = Math.max(0.003, jitter(promptChange ? 0.041 : 0.018 - t * 0.006));
    out.push({
      date,
      conversations,
      tokensIn: Math.round(jitter(2600 + t * 700)),
      tokensOut: Math.round(jitter(420)),
      p50: +jitter(1.9).toFixed(2),
      p95: +jitter(promptChange ? 7.4 : 4.6).toFixed(2),
      evalPass,
      hallucination,
      flagged: Math.round(conversations * (hallucination * 2.2 + 0.01)),
      topics,
    });
  }
  return out;
}

export function costPerConversation(d: Day, strategy: Strategy): number {
  const at = (p: { input: number; output: number }) =>
    (d.tokensIn * p.input + d.tokensOut * p.output) / 1_000_000;
  if (strategy === 'single') return at(PRICES.large);
  return ROUTED_SMALL_SHARE * at(PRICES.small) + (1 - ROUTED_SMALL_SHARE) * at(PRICES.large);
}

export function dailyCost(d: Day, strategy: Strategy): number {
  return d.conversations * costPerConversation(d, strategy);
}

export function sum(days: Day[], f: (d: Day) => number): number {
  return days.reduce((a, d) => a + f(d), 0);
}

export function mean(days: Day[], f: (d: Day) => number): number {
  return days.length ? sum(days, f) / days.length : 0;
}

/** Compare the latest week with the first week of the window for one topic. */
export function topicShift(days: Day[], topic: Topic): number {
  const first = mean(days.slice(0, 7), (d) => d.topics[topic]);
  const last = mean(days.slice(-7), (d) => d.topics[topic]);
  return first ? (last - first) / first : 0;
}
