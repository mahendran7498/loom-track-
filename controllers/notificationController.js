const asyncHandler = require("express-async-handler");
const Notification = require("../models/Notification");
const Machine = require("../models/Machine");
const User = require("../models/User");

// @desc  Scheduler pushes a notification record here after it computes what's due
//        and (optionally) after it dispatches SMS/WhatsApp/Email.
// @route POST /api/notifications/ingest
// @access Scheduler (x-scheduler-key)
const ingestNotification = asyncHandler(async (req, res) => {
  const payload = { ...req.body };

  if (!Array.isArray(payload.recipients) || payload.recipients.length === 0) {
    const recipients = [];
    if (payload.machine) {
      const machine = await Machine.findById(payload.machine).populate({
        path: "assignedEmployees",
        select: "user",
      });
      for (const employee of machine?.assignedEmployees || []) {
        if (employee.user) recipients.push({ user: employee.user, channel: "push" });
      }
    }

    const owners = await User.find({ role: "owner", isActive: true }).select("_id");
    for (const owner of owners) recipients.push({ user: owner._id, channel: "push" });
    payload.recipients = recipients;
  }

  const notification = await Notification.create(payload);
  res.status(201).json({ success: true, data: notification });
});

// @desc  Notification center feed for the logged-in user
// @route GET /api/notifications
const getNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, unreadOnly } = req.query;
  const query = { "recipients.user": req.user._id };
  if (req.query.company) {
    const ids = await Machine.find({ company: req.query.company }).distinct("_id");
    query.machine = { $in: ids };
  }

  if (unreadOnly === "true") query.isRead = false;

  const skip = (Number(page) - 1) * Number(limit);
  const [notifications, total] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Notification.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: notifications,
    pagination: { total, page: Number(page), pages: Math.ceil(total / limit) },
  });
});

const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) {
    res.status(404);
    throw new Error("Notification not found");
  }
  notification.isRead = true;
  await notification.save();
  res.json({ success: true, data: notification });
});

module.exports = { ingestNotification, getNotifications, markAsRead };
