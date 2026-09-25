const asyncHandler = require("express-async-handler");
const SparePart = require("../models/SparePart");
const Machine = require("../models/Machine");
const Employee = require("../models/Employee");

const getEmployee = (userId) => Employee.findOne({ user: userId, isActive: true });

const createSparePart = asyncHandler(async (req, res) => {
  const machine = await Machine.findOne({ _id: req.body.machine, isDeleted: false });
  if (!machine) {
    res.status(404);
    throw new Error("Machine not found");
  }
  let replacedBy = req.body.replacedBy;
  if (req.user.role === "employee") {
    const employee = await getEmployee(req.user._id);
    if (!employee?.assignedMachines.some((id) => String(id) === String(machine._id))) {
      res.status(403);
      throw new Error("You can only add spare parts for assigned machines");
    }
    replacedBy = employee._id;
  }
  const record = await SparePart.create({ ...req.body, replacedBy });
  res.status(201).json({ success: true, data: record });
});

const getSpareParts = asyncHandler(async (req, res) => {
  const { machine, page = 1, limit = 20 } = req.query;
  const query = {};
  if (machine) query.machine = machine;
  if (req.user.role === "employee") {
    const employee = await getEmployee(req.user._id);
    query.replacedBy = employee?._id || null;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    SparePart.find(query)
      .populate("machine", "machineName machineNumber")
      .populate("replacedBy", "name employeeId")
      .sort({ replacementDate: -1 })
      .skip(skip)
      .limit(Number(limit)),
    SparePart.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: records,
    pagination: { total, page: Number(page), pages: Math.ceil(total / limit) },
  });
});

const getSparePartById = asyncHandler(async (req, res) => {
  const record = await SparePart.findById(req.params.id)
    .populate("machine", "machineName machineNumber")
    .populate("replacedBy", "name employeeId");
  if (!record) {
    res.status(404);
    throw new Error("Spare part record not found");
  }
  if (req.user.role === "employee") {
    const employee = await getEmployee(req.user._id);
    if (String(record.replacedBy) !== String(employee?._id)) {
      res.status(403);
      throw new Error("You can only access your own spare-part records");
    }
  }
  res.json({ success: true, data: record });
});

const updateSparePart = asyncHandler(async (req, res) => {
  const record = await SparePart.findById(req.params.id);
  if (!record) {
    res.status(404);
    throw new Error("Spare part record not found");
  }
  if (req.user.role === "employee") {
    const employee = await getEmployee(req.user._id);
    if (String(record.replacedBy) !== String(employee?._id)) {
      res.status(403);
      throw new Error("You can only update your own spare-part records");
    }
  }
  const updates = { ...req.body };
  if (req.user.role === "employee") delete updates.replacedBy;
  Object.assign(record, updates);
  await record.save();
  res.json({ success: true, data: record });
});

const deleteSparePart = asyncHandler(async (req, res) => {
  const record = await SparePart.findById(req.params.id);
  if (!record) {
    res.status(404);
    throw new Error("Spare part record not found");
  }
  await record.deleteOne();
  res.json({ success: true, message: "Spare part record deleted" });
});

module.exports = {
  createSparePart,
  getSpareParts,
  getSparePartById,
  updateSparePart,
  deleteSparePart,
};
