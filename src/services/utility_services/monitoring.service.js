const MAX_RECENT_REQUESTS = 200;
const MAX_RECENT_ERRORS = 100;
const MAX_TIMINGS = 500;
const METRICS_EMIT_INTERVAL_MS = 2000;

class MonitoringService {
  constructor() {
    this.requestsTotal = 0;
    this.errorsTotal = 0;
    this.recentRequests = [];
    this.recentErrors = [];
    this.timings = [];
    this.socketStats = { connectedUsers: 0, updatedAt: null };
    this.lastMetricsEmitAt = 0;
  }

  recordRequest(entry) {
    this.requestsTotal += 1;
    this.recentRequests.unshift(entry);
    if (this.recentRequests.length > MAX_RECENT_REQUESTS) {
      this.recentRequests.pop();
    }

    if (typeof entry.durationMs === 'number') {
      this.timings.unshift(entry.durationMs);
      if (this.timings.length > MAX_TIMINGS) {
        this.timings.pop();
      }
    }
  }

  recordError(entry) {
    this.errorsTotal += 1;
    this.recentErrors.unshift(entry);
    if (this.recentErrors.length > MAX_RECENT_ERRORS) {
      this.recentErrors.pop();
    }
  }

  setSocketStats(nextStats = {}) {
    this.socketStats = {
      ...this.socketStats,
      ...nextStats,
      updatedAt: Date.now()
    };
  }

  shouldEmitMetrics() {
    const now = Date.now();
    if (now - this.lastMetricsEmitAt >= METRICS_EMIT_INTERVAL_MS) {
      this.lastMetricsEmitAt = now;
      return true;
    }
    return false;
  }

  getMetrics() {
    const now = Date.now();
    const windowMs = 5 * 60 * 1000;
    const recentWindow = this.recentRequests.filter((entry) => now - entry.timestamp <= windowMs);
    const windowCount = recentWindow.length;
    const windowErrors = recentWindow.filter((entry) => entry.statusCode >= 500).length;

    const avgDuration = this.timings.length
      ? Math.round(this.timings.reduce((sum, value) => sum + value, 0) / this.timings.length)
      : 0;

    const sortedTimings = [...this.timings].sort((a, b) => a - b);
    const p95Index = sortedTimings.length ? Math.ceil(sortedTimings.length * 0.95) - 1 : 0;
    const p95Duration = sortedTimings.length ? sortedTimings[p95Index] : 0;

    return {
      totals: {
        requests: this.requestsTotal,
        errors: this.errorsTotal
      },
      window: {
        sinceMinutes: 5,
        requests: windowCount,
        errors: windowErrors
      },
      responseTimesMs: {
        average: avgDuration,
        p95: p95Duration
      },
      socketStats: this.socketStats
    };
  }

  getActivity(limit = 50) {
    return {
      requests: this.recentRequests.slice(0, limit),
      errors: this.recentErrors.slice(0, limit)
    };
  }

  getSnapshot(limit = 50) {
    return {
      metrics: this.getMetrics(),
      activity: this.getActivity(limit)
    };
  }
}

module.exports = new MonitoringService();
