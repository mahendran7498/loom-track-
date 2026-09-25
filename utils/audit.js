const ActivityLog = require("../models/ActivityLog");

// Central audit helper used across controllers so every important mutation
// (loom create/update/delete, employee create/update/delete, maintenance,
// work reports, breakdown reports, status changes) lands in ActivityLog.
const logActivity = (req, action, entityType, entityId, details = {}) =>
  ActivityLog.create({
    user: req.user?._id,
    action,
    entityType,
    entityId,
    details,
    ipAddress: req.ip,
  });

module.exports = { logActivity };