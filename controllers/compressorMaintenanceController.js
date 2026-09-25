const { validateMaintenanceStatus, saveMaintenanceStatus } = require("../utils/maintenanceStatus");
const asyncHandler = require("express-async-handler");
const CompressorMaintenance = require("../models/CompressorMaintenance");
const Machine = require("../models/Machine");
const Employee = require("../models/Employee");

const COMPONENT_LABELS = {
  compressorOil: "Compressor Oil",
  oilFilter: "Oil Filter",
  airFilter: "Air Filter",
  oilSeparator: "Oil Separator",
  separatorElement: "Separator Element",
  coolant: "Coolant",
};

const CONTENT_KEYS = Object.keys(COMPONENT_LABELS);

const getEmployee = (userId) => Employee.findOne({ user: userId, isActive: true });

const canManageMachine = async (user, machineId) => {
  if (user.role === "employee") {
    const employee = await getEmployee(user._id);
    return Boolean(employee?.assignedMachines.some((id) => String(id) === String(machineId)));
  }
  return user.role === "general_manager" || user.role === "owner" || user.role === "admin";
};

const assertRecordAccess = async (req, res, record) => {
  if (req.user.role === "admin" || req.user.role === "owner") return;
  if (req.user.role === "general_manager") return;
  if (req.user.role === "employee") {
    if (String(record.performedBy) === String((await getEmployee(req.user._id))?._id)) return;
  }
  res.status(403);
  throw new Error("You are not permitted to access this maintenance record");
};

const nextDateFor = (component, componentConfig) => {
  if (!component) return undefined;
  if (componentConfig.key === "coolant") return component.nextCoolantServiceDate || undefined;
  if (componentConfig.key === "oilSeparator") return component.nextReplacementDate || undefined;
  return component.nextReplacementDate || undefined;
};

const validateRecord = (req, res, parts) => {
  const { machine, maintenanceDate, components = {}, sparesUsed = [] } = parts;
  if (!machine) {
    res.status(400);
    throw new Error("machine is required");
  }
  if (!maintenanceDate) {
    res.status(400);
    throw new Error("maintenanceDate is required");
  }
  if (new Date(maintenanceDate) > new Date()) {
    res.status(400);
    throw new Error("maintenanceDate cannot be in the future");
  }
  const anyComponentChecked = CONTENT_KEYS.some((key) => components[key]?.checked);
  const hasSpares = Array.isArray(sparesUsed) && sparesUsed.length > 0;
  if (!anyComponentChecked && !hasSpares) {
    res.status(400);
    throw new Error("Inspect at least one component or record spare parts used");
  }
};

// @desc    Create a compressor maintenance record
// @route   POST /api/compressor-maintenance
// @access  Employee (assigned machine), General Manager, Owner, Admin
const createCompressorMaintenance = asyncHandler(async (req, res) => {
  const machine = await Machine.findOne({ _id: req.body.machine, isDeleted: false });
  if (!machine) {
    res.status(404);
    throw new Error("Machine not found");
  }
  if (!(await canManageMachine(req.user, machine._id))) {
    res.status(403);
    throw new Error("You can only maintain machines assigned to you");
  }
  validateRecord(req, res, req.body);
  validateMaintenanceStatus(req.body.machineStatus, res);

  const performedBy = req.user.role === "employee"
    ? (await getEmployee(req.user._id))?._id
    : req.body.performedBy;

  const record = await CompressorMaintenance.create({
    ...req.body,
    performedBy,
    approvalStatus: "Submitted",
    createdBy: req.user._id,
  });

  await saveMaintenanceStatus(machine, req.body.machineStatus);

  res.status(201).json({ success: true, data: record });
});

// @desc    List compressor maintenance records
// @route   GET /api/compressor-maintenance
// @access  Protected
const getCompressorMaintenanceRecords = asyncHandler(async (req, res) => {
  const { machine, page = 1, limit = 20 } = req.query;
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 500);
  const query = {};
  if (machine) query.machine = machine;
  if (req.query.company) {
    const ids = await Machine.find({ company: req.query.company }).distinct("_id");
    query.machine = { $in: machine ? ids.filter((id) => String(id) === machine) : ids };
  }

  if (req.user.role === "employee") {
    query.performedBy = (await getEmployee(req.user._id))?._id || null;
  } else if (req.user.role === "general_manager") {
    const employees = await Employee.find({ manager: req.user._id }).select("_id");
    query.performedBy = { $in: employees.map((employee) => employee._id) };
  }


  const skip = (Number(page) - 1) * safeLimit;
  const [records, total] = await Promise.all([
    CompressorMaintenance.find(query)
      .populate("machine", "machineName machineNumber")
      .populate("performedBy", "name employeeId")
      .sort({ maintenanceDate: -1 })
      .skip(skip)
      .limit(safeLimit),
    CompressorMaintenance.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: records,
    pagination: { total, page: Number(page), pages: Math.ceil(total / safeLimit) },
  });
});

// @desc    Get single compressor maintenance record
// @route   GET /api/compressor-maintenance/:id
// @access  Scoped
const getCompressorMaintenanceById = asyncHandler(async (req, res) => {
  const record = await CompressorMaintenance.findById(req.params.id)
    .populate("machine", "machineName machineNumber")
    .populate("performedBy", "name employeeId");
  if (!record) {
    res.status(404);
    throw new Error("Compressor maintenance record not found");
  }
  await assertRecordAccess(req, res, record);
  res.json({ success: true, data: record });
});

// @desc    Update a compressor maintenance record
// @route   PUT /api/compressor-maintenance/:id
// @access  Employee (own), General Manager, Owner, Admin
const updateCompressorMaintenance = asyncHandler(async (req, res) => {
  const record = await CompressorMaintenance.findById(req.params.id);
  if (!record) {
    res.status(404);
    throw new Error("Compressor maintenance record not found");
  }
  await assertRecordAccess(req, res, record);

  const updates = { ...req.body };
  delete updates.machine;
  delete updates.maintenanceType;
  if (req.user.role === "employee") delete updates.performedBy;

  // Managers approve/reject submitted records
  if (req.user.role !== "employee" && updates.approvalStatus) {
    updates.approvedBy = req.user._id;
    updates.approvedAt = new Date();
  }
  if (updates.nextMaintenanceDate) {
    updates.reminderSent = false;
    updates.reminderSentAt = undefined;
  }
  delete updates.approvedBy;
  if (req.user.role === "employee") delete updates.approvalStatus;

  Object.assign(record, updates);
  await record.save();
  res.json({ success: true, data: record });
});

// @desc    Delete a compressor maintenance record
// @route   DELETE /api/compressor-maintenance/:id
// @access  Admin, Owner
const deleteCompressorMaintenance = asyncHandler(async (req, res) => {
  if (!["admin", "owner"].includes(req.user.role)) {
    res.status(403);
    throw new Error("Only admin or owner can delete maintenance history");
  }
  const record = await CompressorMaintenance.findById(req.params.id);
  if (!record) {
    res.status(404);
    throw new Error("Compressor maintenance record not found");
  }
  await record.deleteOne();
  res.json({ success: true, message: "Compressor maintenance record deleted" });
});

// @desc    Per-component maintenance schedule for a machine
// @route   GET /api/compressor-maintenance/schedule?machine=...
// @access  Protected
const getCompressorSchedule = asyncHandler(async (req, res) => {
  const { machine } = req.query;
  if (!machine) {
    res.status(400);
    throw new Error("machine is required");
  }

  const records = await CompressorMaintenance.find({ machine }).sort({ maintenanceDate: -1 });
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const dueSoonWindow = new Date();
  dueSoonWindow.setDate(dueSoonWindow.getDate() + 30);

  const schedule = CONTENT_KEYS.map((key) => {
    const config = { key, label: COMPONENT_LABELS[key] };
    const record = records.find((r) => {
      const component = r.components?.[key];
      return component?.checked && nextDateFor(component, config);
    });
    const nextDate = record ? nextDateFor(record.components[key], config) : undefined;

    let status = "Not Scheduled";
    if (nextDate) {
      if (nextDate < endOfToday) status = "Overdue";
      else if (nextDate <= dueSoonWindow) status = "Due Soon";
      else status = "Completed";
    }

    return {
      component: key,
      label: config.label,
      nextDate: nextDate || null,
      status,
      lastRecordId: record?._id || null,
      lastMaintenanceDate: record?.maintenanceDate || null,
    };
  });

  res.json({ success: true, data: schedule });
});

// @desc    Records due today/overdue on the next maintenance date (scheduler)
// @route   GET /api/compressor-maintenance/due/today
// @access  Scheduler
const getDueCompressorMaintenance = asyncHandler(async (req, res) => {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const due = await CompressorMaintenance.find({
    nextMaintenanceDate: { $lte: endOfToday, $ne: null },
    reminderSent: false,
  }).populate({
    path: "machine",
    populate: { path: "assignedEmployees", select: "name phoneNumber email" },
  });
  res.json({ success: true, data: due });
});

// @desc    Mark a record's reminder as sent (scheduler)
// @route   PATCH /api/compressor-maintenance/:id/mark-reminder-sent
// @access  Scheduler
const markCompressorReminderSent = asyncHandler(async (req, res) => {
  const record = await CompressorMaintenance.findById(req.params.id);
  if (!record) {
    res.status(404);
    throw new Error("Compressor maintenance record not found");
  }
  record.reminderSent = true;
  record.reminderSentAt = new Date();
  await record.save({ validateBeforeSave: false });
  res.json({ success: true, data: record });
});

module.exports = {
  createCompressorMaintenance,
  getCompressorMaintenanceRecords,
  getCompressorMaintenanceById,
  updateCompressorMaintenance,
  deleteCompressorMaintenance,
  getCompressorSchedule,
  getDueCompressorMaintenance,
  markCompressorReminderSent,
};