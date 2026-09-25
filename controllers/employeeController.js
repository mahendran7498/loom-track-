const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Employee = require("../models/Employee");
const User = require("../models/User");
const Machine = require("../models/Machine");
const { logActivity } = require("../utils/audit");

const employeeScope = (req) =>
  req.user.role === "general_manager" ? { manager: req.user._id } : {};

// @desc    Create an employee (optionally also creates their login User)
// @route   POST /api/employees
// @access  Owner
const createEmployee = asyncHandler(async (req, res) => {
  const {
    employeeId,
    name,
    phoneNumber,
    email,
    department,
    designation,
    profilePhoto, manager,
    password,
    assignedMachines = [],
  } = req.body;

  if (!employeeId || !name || !phoneNumber || !email) {
    res.status(400);
    throw new Error("employeeId, name, phoneNumber and email are required");
  }

  if (!Array.isArray(assignedMachines) || !assignedMachines.every(mongoose.isValidObjectId)) {
    res.status(400);
    throw new Error("assignedMachines must be an array of valid machine IDs");
  }

  const assignedMachineIds = [...new Set(assignedMachines.map(String))];
  if (assignedMachineIds.length) {
    const machineCount = await Machine.countDocuments({
      _id: { $in: assignedMachineIds },
      isDeleted: false,
    });
    if (machineCount !== assignedMachineIds.length) {
      res.status(400);
      throw new Error("One or more selected machines do not exist or are deleted");
    }
  }

  const exists = await Employee.findOne({ $or: [{ employeeId }, { email }] });
  if (exists) {
    res.status(409);
    throw new Error("An employee with this ID or email already exists");
  }

  // General managers may only create employees reporting to themselves.
  const employee = await Employee.create({
    employeeId,
    name,
    phoneNumber,
    email,
    department,
    designation,
    profilePhoto,
    assignedMachines: assignedMachineIds,
    manager: req.user.role === "general_manager" ? req.user._id : manager,
  });

  if (assignedMachineIds.length) {
    await Machine.updateMany(
      { _id: { $in: assignedMachineIds } },
      { $addToSet: { assignedEmployees: employee._id } }
    );
  }

  // Create the linked login account if a password was supplied
  if (password) {
    const user = await User.create({
      name,
      email,
      phoneNumber,
      password,
      role: "employee",
      employee: employee._id,
      profilePhoto: profilePhoto || "",
      createdBy: req.user._id,
    });
    employee.user = user._id;
    await employee.save();
  }

  res.status(201).json({ success: true, data: employee });
  logActivity(req, "CREATE_EMPLOYEE", "Employee", employee._id, { name, employeeId });
});

// @desc    List employees
// @route   GET /api/employees
// @access  Owner
const getEmployees = asyncHandler(async (req, res) => {
  const { search, department, page = 1, limit = 20 } = req.query;
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 500);
  const query = { isActive: true, ...employeeScope(req) };
  if (req.query.company) {
    const ids = await Machine.find({ company: req.query.company }).distinct("_id");
    query.assignedMachines = { $in: ids };
  }


  if (department) query.department = department;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { employeeId: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * safeLimit;
  const [employees, total] = await Promise.all([
    Employee.find(query)
      .populate("assignedMachines", "machineName machineNumber status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit),
    Employee.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: employees,
    pagination: { total, page: Number(page), pages: Math.ceil(total / safeLimit) },
  });
});

// @desc    Get single employee
// @route   GET /api/employees/:id
const getEmployeeById = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ _id: req.params.id, ...employeeScope(req) }).populate(
    "assignedMachines",
    "machineName machineNumber status"
  );
  if (!employee) {
    res.status(404);
    throw new Error("Employee not found");
  }
  res.json({ success: true, data: employee });
});

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Owner
const updateEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ _id: req.params.id, ...employeeScope(req) });
  if (!employee) {
    res.status(404);
    throw new Error("Employee not found");
  }
  const {
    employeeId,
    name,
    phoneNumber,
    email,
    department,
    designation,
    profilePhoto,
    password,
    assignedMachines = [],
  } = req.body;

  if (!employeeId || !name || !phoneNumber || !email) {
    res.status(400);
    throw new Error("employeeId, name, phoneNumber and email are required");
  }
  if (!Array.isArray(assignedMachines) || !assignedMachines.every(mongoose.isValidObjectId)) {
    res.status(400);
    throw new Error("assignedMachines must be an array of valid machine IDs");
  }

  const duplicate = await Employee.findOne({
    _id: { $ne: employee._id },
    $or: [{ employeeId }, { email }],
  });
  if (duplicate) {
    res.status(409);
    throw new Error("An employee with this ID or email already exists");
  }

  const assignedMachineIds = [...new Set(assignedMachines.map(String))];
  if (assignedMachineIds.length) {
    const machineCount = await Machine.countDocuments({
      _id: { $in: assignedMachineIds },
      isDeleted: false,
    });
    if (machineCount !== assignedMachineIds.length) {
      res.status(400);
      throw new Error("One or more selected machines do not exist or are deleted");
    }
  }

  const previousMachineIds = employee.assignedMachines.map(String);
  Object.assign(employee, {
    employeeId,
    name,
    phoneNumber,
    email,
    department,
    designation,
    assignedMachines: assignedMachineIds,
  });
  if (profilePhoto !== undefined) employee.profilePhoto = profilePhoto;
  await employee.save();

  const removedMachineIds = previousMachineIds.filter((id) => !assignedMachineIds.includes(id));
  if (removedMachineIds.length) {
    await Machine.updateMany(
      { _id: { $in: removedMachineIds } },
      { $pull: { assignedEmployees: employee._id } }
    );
  }
  if (assignedMachineIds.length) {
    await Machine.updateMany(
      { _id: { $in: assignedMachineIds } },
      { $addToSet: { assignedEmployees: employee._id } }
    );
  }

  if (employee.user) {
    const user = await User.findById(employee.user).select("+password");
    if (user) {
      Object.assign(user, { name, phoneNumber, email, profilePhoto: profilePhoto ?? employee.profilePhoto });
      if (password) user.password = password;
      await user.save();
    }
  } else if (password) {
    const user = await User.create({
      name,
      email,
      phoneNumber,
      password,
      role: "employee",
      employee: employee._id,
      profilePhoto: employee.profilePhoto || "",
      createdBy: req.user._id,
    });
    employee.user = user._id;
    await employee.save();
  }
  res.json({ success: true, data: employee });
  logActivity(req, "UPDATE_EMPLOYEE", "Employee", employee._id, { name, employeeId });
});

// @desc    Deactivate (soft-delete) employee
// @route   DELETE /api/employees/:id
// @access  Owner
const deleteEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ _id: req.params.id, ...employeeScope(req) });
  if (!employee) {
    res.status(404);
    throw new Error("Employee not found");
  }
  employee.isActive = false;
  await employee.save();
  if (employee.user) {
    await User.findByIdAndUpdate(employee.user, { isActive: false });
  }
  res.json({ success: true, message: "Employee deactivated" });
  logActivity(req, "DEACTIVATE_EMPLOYEE", "Employee", employee._id, { name, employeeId });
});

module.exports = {
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
};
