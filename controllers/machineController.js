const asyncHandler = require("express-async-handler");
const Machine = require("../models/Machine");
const Maintenance = require("../models/Maintenance");
const OilChange = require("../models/OilChange");
const SparePart = require("../models/SparePart");
const MaintenanceJob = require("../models/MaintenanceJob");
const CompressorMaintenance = require("../models/CompressorMaintenance");
const AirDryerMaintenance = require("../models/AirDryerMaintenance");
const Employee = require("../models/Employee");
const ActivityLog = require("../models/ActivityLog");
const User = require("../models/User");
const CompanyLayout = require("../models/CompanyLayout");

// @desc    List company names used by active machines
// @route   GET /api/machines/companies
// @access  Private
const getMachineCompanies = asyncHandler(async (_req, res) => {
  const [machineCompanies, ownerCompanies] = await Promise.all([
    Machine.distinct("company", {
      isDeleted: false,
      company: { $exists: true, $ne: "" },
    }),
    User.distinct("companyName", {
      role: "owner",
      isActive: true,
      companyName: { $exists: true, $ne: "" },
    }),
  ]);
  const companies = [...new Set([...machineCompanies, ...ownerCompanies])];

  res.json({
    success: true,
    data: companies.sort((a, b) => a.localeCompare(b)),
  });
});

// @desc    Get the saved layout for a company
// @route   GET /api/machines/company-layout?company=...
// @access  Private
const getCompanyLayout = asyncHandler(async (req, res) => {
  const company = req.query.company?.trim();
  if (!company) {
    res.status(400);
    throw new Error("company is required");
  }

  const layout = await CompanyLayout.findOne({ company });
  res.json({ success: true, data: layout });
});

// @desc    Save or update a company's layout
// @route   PUT /api/machines/company-layout
// @access  Admin
const saveCompanyLayout = asyncHandler(async (req, res) => {
  const company = req.body.company?.trim();
  const layout = normalizeLayout(
    req.body.layoutWidth,
    req.body.layoutLength,
    req.body.machineCount
  );

  if (!company) {
    res.status(400);
    throw new Error("company is required");
  }
  if (!layout) {
    res.status(400);
    throw new Error("layoutWidth and layoutLength must be positive whole numbers");
  }

  const existing = await CompanyLayout.findOne({ company });
  if (existing) {
    if (!req.body.adminPassword) {
      res.status(400);
      throw new Error("Admin password is required to change the layout");
    }
    const admin = await User.findById(req.user._id).select("+password");
    if (!admin || !(await admin.comparePassword(req.body.adminPassword))) {
      res.status(401);
      throw new Error("Admin password is incorrect");
    }
    existing.set({ ...layout, isLocked: true, lockedAt: new Date(), lockedBy: req.user._id });
    await existing.save();
  } else {
    const created = await CompanyLayout.create({
      company,
      ...layout,
      isLocked: true,
      lockedAt: new Date(),
      lockedBy: req.user._id,
    });
    return res.status(201).json({ success: true, data: created });
  }

  res.json({ success: true, data: existing });
});

const isAssignedEmployee = async (user, machineId) => {
  if (user.role !== "employee") return false;
  const employee = await Employee.findOne({ user: user._id, isActive: true });
  return Boolean(employee?.assignedMachines.some((id) => String(id) === String(machineId)));
};

const canViewMachine = async (user, machineId) =>
  user.role === "admin" ||
  user.role === "owner" ||
  user.role === "general_manager" ||
  isAssignedEmployee(user, machineId);

const logActivity = (req, action, entityType, entityId, details = {}) =>
  ActivityLog.create({
    user: req.user?._id,
    action,
    entityType,
    entityId,
    details,
    ipAddress: req.ip,
  });

const normalizeLayout = (layoutWidth, layoutLength, machineCount) => {
  const width = Number(layoutWidth);
  const length = Number(layoutLength);
  const count = Number(machineCount);

  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(length) || length < 1) {
    return null;
  }

  return {
    width,
    length,
    machineCount: Number.isInteger(count) && count >= 1 ? count : width * length,
  };
};

const getLayoutDisplayOrder = (machineNumber, width) => {
  const number = Number(machineNumber);
  if (!Number.isInteger(number) || number < 1 || !Number.isInteger(width) || width < 1) {
    return Number.MAX_SAFE_INTEGER;
  }

  const offset = number - 1;
  const rowBand = Math.floor(offset / (width * 2));
  const positionInBand = offset % (width * 2);
  const rowInBand = positionInBand % 2;
  const column = width - 1 - Math.floor(positionInBand / 2);

  return (rowBand * 2 + rowInBand) * width + column;
};

// @desc    Create a machine
// @route   POST /api/machines
// @access  Owner
const createMachine = asyncHandler(async (req, res) => {
  const {
    machineId,
    assetType = "Machine",
    machineName,
    machineNumber,
    machineCategory,
    machineType,
    company,
    modelNumber,
    serialNumber,
    purchaseDate,
    installationDate,
    warrantyExpiry,
    machineImage,
    status,
    layoutWidth,
    layoutLength,
    section,
    shed,
    brand,
    loomType,
    rpm,
    width,
    assignedEngineer,
    notes,
    pressure,
    temperature,
    oilLevel,
    oilFilterStatus,
    airFilterStatus,
    separatorCondition,
    differentialPressure,
    oilCarryoverStatus,
    separatorElementStatus,
    oRingOrSealStatus,
    coolantLevel,
    inletPressure,
    outletPressure,
    dewPoint,
    drainStatus,
    filterCondition,
    cleaningStatus,
  } = req.body;

  const equipmentNumber = assetType === "Machine" ? machineNumber : (machineNumber || machineId);
  if (!machineId || !machineName || !equipmentNumber) {
    res.status(400);
    throw new Error("machineId and machineName are required");
  }

  if (!["Machine", "Compressor", "Air Dryer"].includes(assetType)) {
    res.status(400);
    throw new Error("assetType must be Machine, Compressor, or Air Dryer");
  }

  const exists = await Machine.findOne({
    $or: [{ machineId }, { machineNumber: equipmentNumber }],
  });
  if (exists) {
    res.status(409);
    throw new Error("A machine with this ID or number already exists");
  }

  const layout =
    normalizeLayout(layoutWidth, layoutLength, req.body.machineCount) || {
      width: 2,
      length: 2,
      machineCount: 4,
    };

  const fallbackCategory =
    assetType === "Compressor"
      ? "compressor"
      : assetType === "Air Dryer"
      ? "air_dryer"
      : "loom";
  const resolvedCategory =
    machineCategory && ["loom", "compressor", "air_dryer", "other"].includes(machineCategory)
      ? machineCategory
      : fallbackCategory;

  const machine = await Machine.create({
    assetType,
    machineId,
    machineName,
    machineNumber,
    machineCategory: resolvedCategory,
    machineType,
    company,
    modelNumber,
    serialNumber,
    purchaseDate,
    installationDate,
    warrantyExpiry,
    machineImage,
    status,
    section,
    shed,
    brand,
    loomType,
    rpm,
    width,
    assignedEngineer,
    notes,
    pressure,
    temperature,
    oilLevel,
    oilFilterStatus,
    airFilterStatus,
    separatorCondition,
    differentialPressure,
    oilCarryoverStatus,
    separatorElementStatus,
    oRingOrSealStatus,
    coolantLevel,
    inletPressure,
    outletPressure,
    dewPoint,
    drainStatus,
    filterCondition,
    cleaningStatus,
    layout: {
      ...layout,
      isLocked: true,
      lockedAt: new Date(),
      lockedBy: req.user._id,
    },
  });

  await logActivity(req, "CREATE_MACHINE", "Machine", machine._id, {
    machineName,
  });

  res.status(201).json({ success: true, data: machine });
});

// @desc    List machines (with search + filters + pagination)
// @route   GET /api/machines
// @access  Owner, Employee (employee sees only assigned machines)
const getMachines = asyncHandler(async (req, res) => {
  const { search, status, company, section, category, page = 1, limit = 20 } = req.query;

  const query = { isDeleted: false };

  if (status) query.status = status;
  if (company) query.company = company;
  if (section) query.section = section;
  if (category) {
    query.machineCategory =
      category === "loom" ? { $in: ["loom", null] } : category;
  }

  if (search) {
    query.$or = [
      { machineName: { $regex: search, $options: "i" } },
      { machineNumber: { $regex: search, $options: "i" } },
      { machineType: { $regex: search, $options: "i" } },
      { section: { $regex: search, $options: "i" } },
      { shed: { $regex: search, $options: "i" } },
    ];
  }

  // Employees only see machines assigned to them
  if (req.user.role === "employee") {
    const employee = await Employee.findOne({ user: req.user._id });
    query._id = { $in: employee ? employee.assignedMachines : [] };
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [loadedMachines, total, companyLayout] = await Promise.all([
    Machine.find(query)
      .populate("assignedEmployees", "name employeeId department")
      .sort({ createdAt: -1 })
      .skip(company ? 0 : skip)
      .limit(company ? 0 : Number(limit)),
    Machine.countDocuments(query),
    company ? CompanyLayout.findOne({ company }).select("width") : null,
  ]);

  let machines = loadedMachines;
  if (company) {
    const orderedMachines = [...loadedMachines];
    if (companyLayout) {
      orderedMachines.sort((a, b) =>
        getLayoutDisplayOrder(a.machineNumber, companyLayout.width) -
        getLayoutDisplayOrder(b.machineNumber, companyLayout.width)
      );
    }
    machines = orderedMachines.slice(skip, skip + Number(limit));
  }

  res.json({
    success: true,
    data: machines,
    pagination: { total, page: Number(page), pages: Math.ceil(total / limit) },
  });
});

// @desc    Get a single machine profile page (info + all related history)
// @route   GET /api/machines/:id
// @access  General Manager, assigned Employee
const getMachineById = asyncHandler(async (req, res) => {
  const machine = await Machine.findOne({
    _id: req.params.id,
    isDeleted: false,
  }).populate("assignedEmployees", "name employeeId department phoneNumber");

  if (!machine) {
    res.status(404);
    throw new Error("Machine not found");
  }
  const canManageMachine = ["admin", "owner"].includes(req.user.role);
  if (!canManageMachine && !(await canViewMachine(req.user, machine._id))) {
    res.status(403);
    throw new Error("You can only access machines assigned to you");
  }

  const [maintenanceHistory, oilChangeHistory, spareHistory, maintenanceJobs, compressorMaintenance, airDryerMaintenance] =
    await Promise.all([
      Maintenance.find({ machine: machine._id })
        .populate("performedBy", "name employeeId")
        .sort({ maintenanceDate: -1 }),
      OilChange.find({ machine: machine._id }).sort({ oilChangeDate: -1 }),
      SparePart.find({ machine: machine._id }).sort({ replacementDate: -1 }),
      MaintenanceJob.find({ machine: machine._id }),
      CompressorMaintenance.find({ machine: machine._id }).sort({ maintenanceDate: -1 }),
      AirDryerMaintenance.find({ machine: machine._id }).sort({ maintenanceDate: -1 }),
    ]);

  const totalSpareCost =
    spareHistory.reduce(
      (sum, s) => sum + (Number(s.price) || 0) * (Number(s.quantity) || 0),
      0
    ) +
    maintenanceJobs.reduce(
      (sum, job) =>
        sum +
        (job.sparesUsed || []).reduce(
          (jobSum, s) =>
            jobSum +
            (Number(s.totalCost) ||
              (Number(s.price) || 0) * (Number(s.quantity) || 0)),
          0
        ),
      0
    );
  const totalJobCount = maintenanceJobs.length;

  // Documents belong to the reporting workflow.  Do not send document URLs
  // to Admin or Owner clients, even if they try to bypass the hidden tab.
  const machineData = machine.toObject();

  res.json({
    success: true,
    data: {
      machine: machineData,
      maintenanceHistory,
      oilChangeHistory,
      spareHistory,
      upcomingMaintenance: maintenanceHistory
        .filter((m) => m.nextMaintenanceDate && m.nextMaintenanceDate > new Date())
        .sort((a, b) => a.nextMaintenanceDate - b.nextMaintenanceDate)[0] || null,
      costSummary: {
        totalSpareCost,
        totalJobCount,
      },
      compressorMaintenance,
      airDryerMaintenance,
    },
  });
});

// @desc    Update a machine
// @route   PUT /api/machines/:id
// @access  Owner
const updateMachine = asyncHandler(async (req, res) => {
  const machine = await Machine.findOne({ _id: req.params.id, isDeleted: false });
  if (!machine) {
    res.status(404);
    throw new Error("Machine not found");
  }
  const { layout, layoutWidth, layoutLength, machineCount, ...safeUpdates } = req.body;
  if (layout || layoutWidth || layoutLength || machineCount) {
    res.status(403);
    throw new Error("Layout can only be changed with admin password");
  }
  Object.assign(machine, safeUpdates);
  await machine.save();

  await logActivity(req, "UPDATE_MACHINE", "Machine", machine._id, safeUpdates);

  res.json({ success: true, data: machine });
});

// @desc    Update a machine layout after password confirmation
// @route   PATCH /api/machines/:id/layout
// @access  Admin
const updateMachineLayout = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    res.status(403);
    throw new Error("Only admin can change machine layout");
  }

  const { layoutWidth, layoutLength, adminPassword, machineCount } = req.body;
  const layout = normalizeLayout(layoutWidth, layoutLength, machineCount);
  if (!layout) {
    res.status(400);
    throw new Error("layoutWidth and layoutLength must be positive whole numbers");
  }
  if (!adminPassword) {
    res.status(400);
    throw new Error("Admin password is required to change the layout");
  }

  const admin = await User.findById(req.user._id).select("+password");
  if (!admin || !(await admin.comparePassword(adminPassword))) {
    res.status(401);
    throw new Error("Admin password is incorrect");
  }

  const machine = await Machine.findOne({ _id: req.params.id, isDeleted: false });
  if (!machine) {
    res.status(404);
    throw new Error("Machine not found");
  }

  machine.layout = {
    ...(machine.layout?.toObject ? machine.layout.toObject() : machine.layout || {}),
    ...layout,
    isLocked: true,
    lockedAt: new Date(),
    lockedBy: req.user._id,
  };
  await machine.save();

  await logActivity(req, "UPDATE_MACHINE_LAYOUT", "Machine", machine._id, layout);

  res.json({ success: true, data: machine });
});

// @desc    Update machine status only (Running/Stopped/Under Maintenance/Breakdown/Idle)
// @route   PATCH /api/machines/:id/status
// @access  Admin, assigned Employee
const updateMachineStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowed = ["Running", "Stopped", "Under Maintenance", "Breakdown", "Idle"];
  if (!allowed.includes(status)) {
    res.status(400);
    throw new Error(`status must be one of: ${allowed.join(", ")}`);
  }

  const machine = await Machine.findOne({ _id: req.params.id, isDeleted: false });
  if (!machine) {
    res.status(404);
    throw new Error("Machine not found");
  }
  const canUpdateStatus =
    req.user.role === "admin" ||
    (await isAssignedEmployee(req.user, machine._id));
  if (!canUpdateStatus) {
    res.status(403);
    throw new Error("You can only update the status of an assigned machine");
  }

  const updated = await Machine.findOneAndUpdate(
    { _id: machine._id, isDeleted: false, $or: [{ statusLocked: { $ne: true } }, { status: "Running" }] },
    { $set: { status, statusLocked: status !== "Running" } },
    { new: true, runValidators: true }
  );
  if (!updated) {
    res.status(409);
    throw new Error("Machine status is locked. Update it from the maintenance page.");
  }

  await logActivity(req, "UPDATE_MACHINE_STATUS", "Machine", machine._id, { status });

  res.json({ success: true, data: updated });
});

// @desc    Soft-delete a machine
// @route   DELETE /api/machines/:id
// @access  Owner
const deleteMachine = asyncHandler(async (req, res) => {
  const machine = await Machine.findById(req.params.id);
  if (!machine) {
    res.status(404);
    throw new Error("Machine not found");
  }

  machine.isDeleted = true;
  await machine.save();

  await logActivity(req, "DELETE_MACHINE", "Machine", machine._id);

  res.json({ success: true, message: "Machine deleted" });
});

// @desc    Assign machine to one or more employees
// @route   POST /api/machines/:id/assign
// @access  Owner
const assignMachine = asyncHandler(async (req, res) => {
  const { employeeIds } = req.body; // array of Employee _ids
  if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
    res.status(400);
    throw new Error("employeeIds must be a non-empty array");
  }

  const machine = await Machine.findOne({ _id: req.params.id, isDeleted: false });
  if (!machine) {
    res.status(404);
    throw new Error("Machine not found");
  }

  machine.assignedEmployees = Array.from(
    new Set([...machine.assignedEmployees.map(String), ...employeeIds])
  );
  await machine.save();

  await Employee.updateMany(
    { _id: { $in: employeeIds } },
    { $addToSet: { assignedMachines: machine._id } }
  );

  await logActivity(req, "ASSIGN_MACHINE", "Machine", machine._id, { employeeIds });

  res.json({ success: true, data: machine });
});

// @desc    Attach uploaded document URLs to a machine
// @route   POST /api/machines/:id/documents
// @access  General Manager, assigned Employee
const addMachineDocuments = asyncHandler(async (req, res) => {
  const { documents } = req.body;
  if (!Array.isArray(documents) || documents.length === 0) {
    res.status(400);
    throw new Error("documents must be a non-empty array of URLs");
  }
  const machine = await Machine.findOne({ _id: req.params.id, isDeleted: false });
  if (!machine) {
    res.status(404);
    throw new Error("Machine not found");
  }
  if (!(await canViewMachine(req.user, machine._id))) {
    res.status(403);
    throw new Error("You can only update machines assigned to you");
  }

  machine.documents = [...new Set([...(machine.documents || []), ...documents])];
  await machine.save();

  await logActivity(req, "UPLOAD_DOCUMENT", "Machine", machine._id, {
    count: documents.length,
  });

  res.json({ success: true, data: machine });
});

// @desc    Remove a document URL from a machine
// @route   DELETE /api/machines/:id/documents
// @access  General Manager, assigned Employee
const removeMachineDocument = asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url) {
    res.status(400);
    throw new Error("url is required");
  }
  const machine = await Machine.findOne({ _id: req.params.id, isDeleted: false });
  if (!machine) {
    res.status(404);
    throw new Error("Machine not found");
  }
  if (!(await canViewMachine(req.user, machine._id))) {
    res.status(403);
    throw new Error("You can only update machines assigned to you");
  }

  machine.documents = (machine.documents || []).filter((doc) => doc !== url);
  await machine.save();

  await logActivity(req, "DELETE_DOCUMENT", "Machine", machine._id, { url });

  res.json({ success: true, data: machine });
});

module.exports = {
  createMachine,
  getMachineCompanies,
  getCompanyLayout,
  saveCompanyLayout,
  getMachines,
  getMachineById,
  updateMachine,
  updateMachineStatus,
  deleteMachine,
  assignMachine,
  updateMachineLayout,
  addMachineDocuments,
  removeMachineDocument,
};
