const asyncHandler = require("express-async-handler");
const MaintenanceJob = require("../models/MaintenanceJob");
const Machine = require("../models/Machine");
const Employee = require("../models/Employee");
const { logActivity } = require("../utils/audit");

const currentEmployee = (userId) =>
  Employee.findOne({ user: userId, isActive: true });

const canManageJob = async (user, job) => {
  if (user.role === "admin") return true;

  if (user.role === "employee") {
    const employee = await currentEmployee(user._id);
    return String(job.performedBy) === String(employee?._id);
  }

  if (user.role === "general_manager") {
    return Boolean(
      await Employee.exists({ _id: job.performedBy, manager: user._id, isActive: true })
    );
  }

  return false;
};

const canViewJob = async (user, job) => {
  if (user.role === "admin" || user.role === "owner") return true;
  return canManageJob(user, job);
};

// POST /api/maintenance-jobs
const createMaintenanceJob = asyncHandler(async (req, res) => {
  const machine = await Machine.findOne({ _id: req.body.machine, isDeleted: false });
  if (!machine) {
    res.status(404);
    throw new Error("Machine not found");
  }
  const employee = await currentEmployee(req.user._id);
  if (!employee?.assignedMachines.some((id) => String(id) === String(machine._id))) {
    res.status(403);
    throw new Error("You can only submit reports for machines assigned to you");
  }

  // Never accept performedBy from the browser; otherwise an employee could
  // submit a report in another employee's name.
  const job = await MaintenanceJob.create({
    machine: machine._id,
    whyStopped: req.body.whyStopped,
    sparesUsed: req.body.sparesUsed || [],
    laborCost: req.body.laborCost,
    sparePartsCost: req.body.sparePartsCost,
    otherCost: req.body.otherCost,
    nextMaintenanceDate: req.body.nextMaintenanceDate,
    jobStatus: req.body.jobStatus,
    performedBy: employee._id,
  });
  logActivity(req, "CREATE_WORK_REPORT", "MaintenanceJob", job._id, {
    machine: machine._id,
    whyStopped: job.whyStopped,
  });
  res.status(201).json({ success: true, data: job });
});

// GET /api/maintenance-jobs?machine=<id>&page=1&limit=20
const getMaintenanceJobs = asyncHandler(async (req, res) => {
  const { machine, page = 1, limit = 20 } = req.query;
  const query = {};
  if (machine) query.machine = machine;

  if (req.user.role === "employee") {
    const employee = await currentEmployee(req.user._id);
    query.performedBy = employee?._id || null;
  } else if (req.user.role === "general_manager") {
    const employees = await Employee.find({ manager: req.user._id, isActive: true }).select("_id");
    query.performedBy = { $in: employees.map((employee) => employee._id) };
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    MaintenanceJob.find(query)
      .populate("machine", "machineName machineNumber")
      .populate("performedBy", "name employeeId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    MaintenanceJob.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: records,
    pagination: { total, page: Number(page), pages: Math.ceil(total / limit) },
  });
});

// GET /api/maintenance-jobs/:id
const getMaintenanceJobById = asyncHandler(async (req, res) => {
  const job = await MaintenanceJob.findById(req.params.id)
    .populate("machine", "machineName machineNumber")
    .populate("performedBy", "name employeeId");
  if (!job) {
    res.status(404);
    throw new Error("Maintenance job not found");
  }
  if (!(await canViewJob(req.user, job))) {
    res.status(403);
    throw new Error("You are not permitted to access this employee report");
  }
  res.json({ success: true, data: job });
});

// PUT /api/maintenance-jobs/:id
const updateMaintenanceJob = asyncHandler(async (req, res) => {
  const job = await MaintenanceJob.findById(req.params.id);
  if (!job) {
    res.status(404);
    throw new Error("Maintenance job not found");
  }
  if (!(await canManageJob(req.user, job))) {
    res.status(403);
    throw new Error("You can only edit reports submitted by employees you manage");
  }
  // Keep the reporter and machine immutable during a manager review.
  const updates = {};
  if (typeof req.body.whyStopped === "string") updates.whyStopped = req.body.whyStopped;
  if (Array.isArray(req.body.sparesUsed)) updates.sparesUsed = req.body.sparesUsed;
  if (req.body.laborCost !== undefined) updates.laborCost = req.body.laborCost;
  if (req.body.sparePartsCost !== undefined) updates.sparePartsCost = req.body.sparePartsCost;
  if (req.body.otherCost !== undefined) updates.otherCost = req.body.otherCost;
  if (req.body.nextMaintenanceDate !== undefined) updates.nextMaintenanceDate = req.body.nextMaintenanceDate;
  if (req.body.jobStatus !== undefined) updates.jobStatus = req.body.jobStatus;
  Object.assign(job, updates);
  await job.save();
  res.json({ success: true, data: job });
});

// DELETE /api/maintenance-jobs/:id  (owner only)
const deleteMaintenanceJob = asyncHandler(async (req, res) => {
  const job = await MaintenanceJob.findById(req.params.id);
  if (!job) {
    res.status(404);
    throw new Error("Maintenance job not found");
  }
  if (!(await canManageJob(req.user, job))) {
    res.status(403);
    throw new Error("You can only delete reports submitted by employees you manage");
  }
  await job.deleteOne();
  res.json({ success: true, message: "Maintenance job deleted" });
});

module.exports = {
  createMaintenanceJob,
  getMaintenanceJobs,
  getMaintenanceJobById,
  updateMaintenanceJob,
  deleteMaintenanceJob,
};
