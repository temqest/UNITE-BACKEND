const monitoringService = require('../services/utility_services/monitoring.service');

function generateRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = function monitoringMiddleware(req, res, next) {
  const startTime = process.hrtime.bigint();
  const requestId = generateRequestId();

  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
    const entry = {
      requestId,
      method: req.method,
      path: (req.originalUrl || req.url || '').split('?')[0],
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs),
      ip: req.ip,
      userId: req.user?.id || req.user?._id || null,
      timestamp: Date.now()
    };

    monitoringService.recordRequest(entry);

    const io = req.app && req.app.get && req.app.get('io');
    if (io) {
      io.to('monitoring-admin').emit('monitoring_activity', entry);
      if (monitoringService.shouldEmitMetrics()) {
        io.to('monitoring-admin').emit('monitoring_metrics', monitoringService.getMetrics());
      }
    }
  });

  next();
};
