function requireAdmin(req, res, next) {
  if (req.user?.role === 'Admin') return next();
  return res.status(403).json({ success: false, message: 'Admin access required' });
}

function requireCoordinator(req, res, next) {
  if (req.user?.role === 'Coordinator') return next();
  return res.status(403).json({ success: false, message: 'Coordinator access required' });
}

function requireStakeholder(req, res, next) {
  if (req.user?.role === 'Stakeholder') return next();
  return res.status(403).json({ success: false, message: 'Stakeholder access required' });
}

function requireAdminOrCoordinator(req, res, next) {
  const role = req.user?.role || '';
  if (role === 'Admin' || role === 'Coordinator') return next();
  return res.status(403).json({ success: false, message: 'Admin or Coordinator access required' });
}

module.exports = { requireAdmin, requireCoordinator, requireStakeholder, requireAdminOrCoordinator };


