const asyncHandler = require("express-async-handler");
const WorkLog = require("../models/WorkLog");
const Machine = require("../models/Machine");
const Employee = require("../models/Employee");

const getEmployee = (userId) => Employee.findOne({ user: userId, isActive: true });

const assertAssigned = async (req, res, machineId) => {
  if (req.user.role !== "employee") return null;
  const employee = await getEmployee(req.user._id);
  if (
    machineId &&
    !employee?.assignedMachines.some((id) => String(id) === String(machineId))
  ) {
    res.status(403);
    throw new Error("You can only create work entries for assigned machines");
  }
  return employee;
};

// @desc    Log a new work entry (material handling or small/unplanned work)
// @route   POST /api/work-logs
// @access  Owner, General Manager, Employee
const createWorkLog = asyncHandler(async (req, res) => {
  const {
    workType,
    machine,
    materialName,
    quantity,
    unit,
    description,
    photos,
    submittedTo,
  } = req.body;

  if (machine) {
    const machineDoc = await Machine.findOne({ _id: machine, isDeleted: false });
    if (!machineDoc) {
      res.status(404);
      throw new Error("Machine not found");
    }
  }
  const currentEmployee = await assertAssigned(req, res, machine);

  const workLog = await WorkLog.create({
    workType,
    machine: machine || undefined,
    materialName: materialName?.trim() || undefined,
    quantity: quantity ?? undefined,
    unit: unit?.trim() || undefined,
    description: description?.trim() || undefined,
    photos: photos || [],
    doneBy: currentEmployee?._id,
    createdBy: req.user?._id,
    status: "Submitted",
    submittedTo: submittedTo || [],
  });

  res.status(201).json({ success: true, data: workLog });
});

// @desc    List work entries, optionally filtered by machine / type
// @route   GET /api/work-logs?machine=&workType=&page=&limit=
// @access  Owner, General Manager, Employee (employees see their own records)
const listWorkLogs = asyncHandler(async (req, res) => {
  const { machine, workType, page = 1, limit = 50 } = req.query;
  const query = {};
  if (machine) query.machine = machine;
  if (workType) query.workType = workType;
  if (req.user.role === "employee") {
    const employee = await getEmployee(req.user._id);
    query.doneBy = employee?._id || null;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    WorkLog.find(query)
      .populate("machine", "machineName machineNumber machineCategory")
      .populate("doneBy", "name employeeId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    WorkLog.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: records,
    pagination: { total, page: Number(page), pages: Math.ceil(total / limit) },
  });
});

// @desc    Get a single work entry
// @route   GET /api/work-logs/:id
const getWorkLogById = asyncHandler(async (req, res) => {
  const record = await WorkLog.findById(req.params.id)
    .populate("machine", "machineName machineNumber machineCategory")
    .populate("doneBy", "name employeeId");

  if (!record) {
    res.status(404);
    throw new Error("Work entry not found");
  }
  if (req.user.role === "employee") {
    const employee = await getEmployee(req.user._id);
    if (String(record.doneBy) !== String(employee?._id)) {
      res.status(403);
      throw new Error("You can only access your own work entries");
    }
  }
  res.json({ success: true, data: record });
});

// @desc    Update a work entry
// @route   PUT /api/work-logs/:id
const updateWorkLog = asyncHandler(async (req, res) => {
  const record = await WorkLog.findById(req.params.id);
  if (!record) {
    res.status(404);
    throw new Error("Work entry not found");
  }
  if (req.user.role === "employee") {
    const employee = await getEmployee(req.user._id);
    if (String(record.doneBy) !== String(employee?._id)) {
      res.status(403);
      throw new Error("You can only update your own work entries");
    }
  }

  const updates = { ...req.body };
  if (req.user.role === "employee") {
    delete updates.doneBy;
    delete updates.createdBy;
  }
  Object.assign(record, updates);
  await record.save();

  res.json({ success: true, data: record });
});

// @desc    Delete a work entry
// @route   DELETE /api/work-logs/:id
// @access  Owner, General Manager, own records by Employee
const deleteWorkLog = asyncHandler(async (req, res) => {
  const record = await WorkLog.findById(req.params.id);
  if (!record) {
    res.status(404);
    throw new Error("Work entry not found");
  }
  if (req.user.role === "employee") {
    const employee = await getEmployee(req.user._id);
    if (String(record.doneBy) !== String(employee?._id)) {
      res.status(403);
      throw new Error("You can only delete your own work entries");
    }
  }
  await record.deleteOne();
  res.json({ success: true, message: "Work entry deleted" });
});

module.exports = {
  createWorkLog,
  listWorkLogs,
  getWorkLogById,
  updateWorkLog,
  deleteWorkLog,
};