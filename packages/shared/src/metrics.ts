// Prometheus text exposition helpers (no dependency: the format is small and stable).

export interface MetricSample {
  labels?: Record<string, string>;
  value: number;
}

export interface Metric {
  name: string;
  help: string;
  type: "gauge" | "counter";
  samples: MetricSample[];
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function formatLabels(labels: Record<string, string> | undefined): string {
  const entries = Object.entries(labels ?? {});
  if (entries.length === 0) return "";
  return `{${entries.map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(",")}}`;
}

export function renderMetrics(metrics: Metric[]): string {
  const lines: string[] = [];
  for (const metric of metrics) {
    lines.push(`# HELP ${metric.name} ${metric.help}`, `# TYPE ${metric.name} ${metric.type}`);
    for (const sample of metric.samples) {
      lines.push(`${metric.name}${formatLabels(sample.labels)} ${Number.isFinite(sample.value) ? sample.value : 0}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** In-process HTTP counters/histogram; bounded label sets (method + status class) keep cardinality fixed. */
export class HttpMetrics {
  private readonly counts = new Map<string, number>();
  private readonly buckets = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  private readonly bucketCounts = new Array<number>(this.buckets.length + 1).fill(0);
  private durationSum = 0;
  private durationCount = 0;

  record(method: string, status: number, durationMs: number): void {
    const key = `${method.toUpperCase()}|${Math.floor(status / 100)}xx`;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    const seconds = durationMs / 1000;
    this.durationSum += seconds;
    this.durationCount += 1;
    const index = this.buckets.findIndex((bound) => seconds <= bound);
    this.bucketCounts[index === -1 ? this.buckets.length : index]! += 1;
  }

  toMetrics(): Metric[] {
    const requests: Metric = {
      name: "content_agent_http_requests_total",
      help: "HTTP requests handled by the API since start",
      type: "counter",
      samples: [...this.counts.entries()].map(([key, value]) => {
        const [method, status] = key.split("|") as [string, string];
        return { labels: { method, status }, value };
      })
    };
    let cumulative = 0;
    const bucketSamples: MetricSample[] = this.buckets.map((bound, index) => {
      cumulative += this.bucketCounts[index]!;
      return { labels: { le: String(bound) }, value: cumulative };
    });
    cumulative += this.bucketCounts[this.buckets.length]!;
    bucketSamples.push({ labels: { le: "+Inf" }, value: cumulative });
    return [
      requests,
      { name: "content_agent_http_request_duration_seconds_bucket", help: "HTTP request duration histogram buckets", type: "counter", samples: bucketSamples },
      { name: "content_agent_http_request_duration_seconds_sum", help: "Total HTTP request duration", type: "counter", samples: [{ value: Number(this.durationSum.toFixed(6)) }] },
      { name: "content_agent_http_request_duration_seconds_count", help: "HTTP requests measured", type: "counter", samples: [{ value: this.durationCount }] }
    ];
  }
}

export const workerHeartbeatKey = "content-agent:worker:heartbeat";
export const workerHeartbeatIntervalMs = 15_000;
export const workerHeartbeatMaxAgeMs = 45_000;

/** Age in ms of the worker heartbeat, or null when the worker never reported / the key expired. */
export function heartbeatAgeMs(stored: string | null, now = Date.now()): number | null {
  if (!stored) return null;
  const at = Number(stored);
  return Number.isFinite(at) ? Math.max(0, now - at) : null;
}

export function workerIsAlive(stored: string | null, now = Date.now()): boolean {
  const age = heartbeatAgeMs(stored, now);
  return age !== null && age <= workerHeartbeatMaxAgeMs;
}
