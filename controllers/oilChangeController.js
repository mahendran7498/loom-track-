const asyncHandler = require("express-async-handler");
const OilChange = require("../models/OilChange");
const Machine = require("../models/Machine");
const ActivityLog = require("../models/ActivityLog");
const Employee = require("../models/Employee");
const Notification = require("../models/Notification");
const User = require("../models/User");

const getEmployee = (userId) => Employee.findOne({ user: userId, isActive: true });

const assertAssigned = async (req, res, machineId) => {
  if (req.user.role !== "employee") return null;
  const employee = await getEmployee(req.user._id);
  if (!employee?.assignedMachines.some((id) => String(id) === String(machineId))) {
    res.status(403);
    throw new Error("You can only create records for assigned machines");
  }
  return employee;
};

// @desc    Log a new oil change. nextOilChangeDate = oilChangeDate + 6 months
//          is computed automatically by the OilChange model's pre-validate hook.
// @route   POST /api/oil-changes
// @access  Owner, assigned Employee
const createOilChange = asyncHandler(async (req, res) => {
  const {
    machine,
    oilChangeDate,
    oilType,
    oilQuantity,
    changedBy,
    remarks,
    reminderMonthsInterval,
  } = req.body;

  const machineDoc = await Machine.findOne({ _id: machine, isDeleted: false });
  if (!machineDoc) {
    res.status(404);
    throw new Error("Machine not found");
  }
  const currentEmployee = await assertAssigned(req, res, machine);

  const oilChange = await OilChange.create({
    machine,
    oilChangeDate,
    oilType,
    oilQuantity,
    changedBy: currentEmployee?._id || changedBy,
    remarks,
    reminderMonthsInterval,
  });

  await ActivityLog.create({
    user: req.user?._id,
    action: "CREATE_OIL_CHANGE",
    entityType: "OilChange",
    entityId: oilChange._id,
    details: { machine, oilChangeDate },
  });

  res.status(201).json({ success: true, data: oilChange });
});

// @desc    List oil change history, optionally filtered by machine
// @route   GET /api/oil-changes?machine=<id>
// @access  Owner, Employee
const getOilChanges = asyncHandler(async (req, res) => {
  const { machine, page = 1, limit = 20 } = req.query;
  const query = {};
  if (machine) query.machine = machine;
  if (req.user.role === "employee") {
    const employee = await getEmployee(req.user._id);
    query.changedBy = employee?._id || null;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [records, total] = await Promise.all([
    OilChange.find(query)
      .populate("machine", "machineName machineNumber")
      .populate("changedBy", "name employeeId")
      .sort({ oilChangeDate: -1 })
      .skip(skip)
      .limit(Number(limit)),
    OilChange.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: records,
    pagination: { total, page: Number(page), pages: Math.ceil(total / limit) },
  });
});

// @desc    Get a single oil change record
// @route   GET /api/oil-changes/:id
const getOilChangeById = asyncHandler(async (req, res) => {
  const record = await OilChange.findById(req.params.id)
    .populate("machine", "machineName machineNumber")
    .populate("changedBy", "name employeeId");

  if (!record) {
    res.status(404);
    throw new Error("Oil change record not found");
  }
  if (req.user.role === "employee") {
    const employee = await getEmployee(req.user._id);
    if (String(record.changedBy) !== String(employee?._id)) {
      res.status(403);
      throw new Error("You can only access your own oil-change records");
    }
  }
  res.json({ success: true, data: record });
});

// @desc    Update an oil change record. If oilChangeDate changes, the
//          nextOilChangeDate is automatically recalculated by the model hook,
//          and the reminder flag resets so a fresh reminder will fire.
// @route   PUT /api/oil-changes/:id
// @access  Owner, assigned Employee
const updateOilChange = asyncHandler(async (req, res) => {
  const record = await OilChange.findById(req.params.id);
  if (!record) {
    res.status(404);
    throw new Error("Oil change record not found");
  }
  if (req.user.role === "employee") {
    const employee = await getEmployee(req.user._id);
    if (String(record.changedBy) !== String(employee?._id)) {
      res.status(403);
      throw new Error("You can only update your own oil-change records");
    }
  }

  const updates = { ...req.body };
  if (req.user.role === "employee") delete updates.changedBy;
  Object.assign(record, updates);
  await record.save(); // triggers pre-validate hook to recompute nextOilChangeDate

  res.json({ success: true, data: record });
});

// @desc    Delete an oil change record
// @route   DELETE /api/oil-changes/:id
// @access  Owner, General Manager, own records by Employee
const deleteOilChange = asyncHandler(async (req, res) => {
  const record = await OilChange.findById(req.params.id);
  if (!record) {
    res.status(404);
    throw new Error("Oil change record not found");
  }
  if (req.user.role === "employee") {
    const employee = await getEmployee(req.user._id);
    if (String(record.changedBy) !== String(employee?._id)) {
      res.status(403);
      throw new Error("You can only delete your own oil-change records");
    }
  }
  await record.deleteOne();
  res.json({ success: true, message: "Oil change record deleted" });
});

// @desc    Records due today (or overdue) that haven't had a reminder sent.
//          Called internally by the Python scheduler once a day.
// @route   GET /api/oil-changes/due/today
// @access  Scheduler (x-scheduler-key) or Owner
const getDueOilChanges = asyncHandler(async (req, res) => {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const due = await OilChange.find({
    nextOilChangeDate: { $lte: endOfToday },
    reminderSent: false,
  })
    .populate("machine", "machineName machineNumber assignedEmployees")
    .populate({
      path: "machine",
      populate: { path: "assignedEmployees", select: "name phoneNumber email" },
    });

  res.json({ success: true, data: due });
});

// Create one in-app notification per due oil change (deduplicated by sourceId)
// so employees and the owner always see the reminder regardless of whether
// the external scheduler is running. The scheduler's own reminderSent flag is
// left untouched so SMS/WhatsApp/Email dispatch still happens normally.
const ensureOilChangeReminderNotifications = async (dueItems) => {
  if (!dueItems.length) return;
  const owners = await User.find({ role: "owner", isActive: true }).select("_id");
  const ownerIds = owners.map((o) => o._id);

  for (const item of dueItems) {
    const exists = await Notification.exists({
      type: "Oil Change Reminder",
      sourceCollection: "OilChange",
      sourceId: item.recordId,
    });
    if (exists) continue;

    const employees = await Employee.find({
      assignedMachines: item.machineId,
      isActive: true,
    }).select("user name");
    const recipients = [];
    for (const emp of employees) {
      if (emp.user) recipients.push({ user: emp.user, channel: "push" });
    }
    for (const ownerId of ownerIds) {
      recipients.push({ user: ownerId, channel: "push" });
    }

    await Notification.create({
      type: "Oil Change Reminder",
      title: `Oil Change Due - ${item.machineName}`,
      message: `Machine: ${item.machineName} (${item.machineNumber})\nOil change is due. Please replace the oil and log it in the system.`,
      machine: item.machineId,
      recipients,
      sourceCollection: "OilChange",
      sourceId: item.recordId,
    });
  }
};

// @desc    Oil change due status for the latest record per machine. Also
//          ensures in-app 'Oil Change Reminder' notifications are created.
// @route   GET /api/oil-changes/due-status
// @access  Owner, General Manager, Employee (assigned machines only)
const getOilChangeDueStatus = asyncHandler(async (req, res) => {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const latest = await OilChange.aggregate([
    { $sort: { oilChangeDate: -1 } },
    {
      $group: {
        _id: "$machine",
        recordId: { $first: "$_id" },
        oilChangeDate: { $first: "$oilChangeDate" },
        nextOilChangeDate: { $first: "$nextOilChangeDate" },
      },
    },
  ]);

  const machineIds = latest.filter((l) => l._id).map((l) => l._id);
  const machines = await Machine.find({ _id: { $in: machineIds }, isDeleted: false }).select(
    "machineName machineNumber machineCategory"
  );
  const machineById = new Map(machines.map((m) => [String(m._id), m]));

  let items = latest
    .filter((l) => l._id && machineById.has(String(l._id)))
    .map((l) => {
      const m = machineById.get(String(l._id));
      const next = l.nextOilChangeDate ? new Date(l.nextOilChangeDate) : null;
      const due = next ? next <= endOfToday : false;
      const daysUntil = next ? Math.ceil((next - now) / 86400000) : null;
      return {
        machine: {
          _id: m._id,
          machineName: m.machineName,
          machineNumber: m.machineNumber,
          machineCategory: m.machineCategory,
        },
        oilChangeDate: l.oilChangeDate,
        nextOilChangeDate: l.nextOilChangeDate,
        due,
        daysUntil,
        recordId: l.recordId,
        machineId: l._id,
      };
    });

  if (req.user.role === "employee") {
    const employee = await getEmployee(req.user._id);
    const assigned = new Set((employee?.assignedMachines || []).map((id) => String(id)));
    items = items.filter((i) => assigned.has(String(i.machineId)));
  }

  const dueItems = items.filter((i) => i.due);
  try {
    await ensureOilChangeReminderNotifications(dueItems);
  } catch (err) {
    console.error("Failed to ensure oil change reminders:", err.message);
  }

  res.json({
    success: true,
    data: items.sort(
      (a, b) => Number(b.due) - Number(a.due) || (a.daysUntil ?? 1e9) - (b.daysUntil ?? 1e9)
    ),
  });
});

// @desc    Mark a record's reminder as sent (called by scheduler after it
//          successfully dispatches SMS/WhatsApp/Email).
// @route   PATCH /api/oil-changes/:id/mark-reminder-sent
// @access  Scheduler (x-scheduler-key)
const markReminderSent = asyncHandler(async (req, res) => {
  const record = await OilChange.findById(req.params.id);
  if (!record) {
    res.status(404);
    throw new Error("Oil change record not found");
  }
  record.reminderSent = true;
  record.reminderSentAt = new Date();
  await record.save({ validateBeforeSave: false });
  res.json({ success: true, data: record });
});

module.exports = {
  createOilChange,
  getOilChanges,
  getOilChangeById,
  updateOilChange,
  deleteOilChange,
  getDueOilChanges,
  getOilChangeDueStatus,
  markReminderSent,
};
