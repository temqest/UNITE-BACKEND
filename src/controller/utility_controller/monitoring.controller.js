const mongoose = require('mongoose');
const monitoringService = require('../../services/utility_services/monitoring.service');

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'token',
  'secret',
  'jwt',
  'refresh',
  'access',
  'api-key',
  'apikey'
]);

function sanitizeValue(value, depth = 0) {
  if (depth > 4) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === 'object') {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
        result[key] = '[redacted]';
      } else {
        result[key] = sanitizeValue(val, depth + 1);
      }
    }
    return result;
  }
  if (typeof value === 'string' && value.length > 2000) {
    return `${value.slice(0, 2000)}...[truncated]`;
  }
  return value;
}

function sanitizeHeaders(headers = {}) {
  const sanitized = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = String(key).toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '[redacted]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function getDbStatus() {
  const state = mongoose.connection.readyState;
  const label = state === 1 ? 'connected' : state === 2 ? 'connecting' : state === 3 ? 'disconnecting' : 'disconnected';
  return { state, label, name: mongoose.connection.name || null };
}

function getHealth(req, res) {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      database: getDbStatus(),
      memory: {
        rss: process.memoryUsage().rss,
        heapTotal: process.memoryUsage().heapTotal,
        heapUsed: process.memoryUsage().heapUsed
      }
    }
  });
}

function getMetrics(req, res) {
  res.status(200).json({
    success: true,
    data: monitoringService.getMetrics()
  });
}

function getActivity(req, res) {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  res.status(200).json({
    success: true,
    data: monitoringService.getActivity(limit)
  });
}

function ping(req, res) {
  res.status(200).json({
    success: true,
    data: {
      message: 'pong',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId || null
    }
  });
}

function echo(req, res) {
  res.status(200).json({
    success: true,
    data: {
      method: req.method,
      path: (req.originalUrl || req.url || '').split('?')[0],
      query: sanitizeValue(req.query || {}),
      body: sanitizeValue(req.body || {}),
      headers: sanitizeHeaders(req.headers || {}),
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId || null
    }
  });
}

module.exports = {
  getHealth,
  getMetrics,
  getActivity,
  ping,
  echo
};
