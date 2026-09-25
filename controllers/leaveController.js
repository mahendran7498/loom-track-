const asyncHandler = require("express-async-handler");
const LeaveRequest = require("../models/LeaveRequest");
const Employee = require("../models/Employee");

const getEmployee = (userId) => Employee.findOne({ user: userId, isActive: true });

const getAccessibleQuery = async (req) => {
  if (["admin", "owner"].includes(req.user.role)) return {};
  if (req.user.role === "employee") {
    const employee = await getEmployee(req.user._id);
    return { employee: employee?._id || null };
  }
  if (req.user.role === "general_manager") {
    const employees = await Employee.find({ manager: req.user._id, isActive: true }).select("_id");
    return { employee: { $in: employees.map((employee) => employee._id) } };
  }
  return {};
};

const createLeaveRequest = asyncHandler(async (req, res) => {
  const employee = await getEmployee(req.user._id);
  if (!employee) {
    res.status(404);
    throw new Error("Employee profile not found");
  }

  const record = await LeaveRequest.create({
    employee: employee._id,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    leaveType: req.body.leaveType,
    reason: req.body.reason,
  });

  res.status(201).json({ success: true, data: record });
});

const getLeaveRequests = asyncHandler(async (req, res) => {
  const query = await getAccessibleQuery(req);
  const records = await LeaveRequest.find(query)
    .populate("employee", "name employeeId department designation")
    .populate("reviewedBy", "name role")
    .sort({ createdAt: -1 });

  res.json({ success: true, data: records });
});

const updateLeaveRequest = asyncHandler(async (req, res) => {
  const record = await LeaveRequest.findById(req.params.id);
  if (!record) {
    res.status(404);
    throw new Error("Leave request not found");
  }

  if (req.user.role === "employee") {
    const employee = await getEmployee(req.user._id);
    if (String(record.employee) !== String(employee?._id)) {
      res.status(403);
      throw new Error("You can only update your own leave requests");
    }
    if (record.status !== "Pending") {
      res.status(400);
      throw new Error("Approved or rejected leave requests cannot be edited");
    }
    record.startDate = req.body.startDate || record.startDate;
    record.endDate = req.body.endDate || record.endDate;
    record.leaveType = req.body.leaveType || record.leaveType;
    record.reason = req.body.reason || record.reason;
    await record.save();
    return res.json({ success: true, data: record });
  }

  if (!["admin", "owner", "general_manager"].includes(req.user.role)) {
    res.status(403);
    throw new Error("Not permitted");
  }

  if (req.body.status) {
    record.status = req.body.status;
    record.reviewedBy = req.user._id;
    record.reviewedAt = new Date();
  }
  await record.save();
  res.json({ success: true, data: record });
});

const deleteLeaveRequest = asyncHandler(async (req, res) => {
  const record = await LeaveRequest.findById(req.params.id);
  if (!record) {
    res.status(404);
    throw new Error("Leave request not found");
  }

  if (req.user.role === "employee") {
    const employee = await getEmployee(req.user._id);
    if (String(record.employee) !== String(employee?._id)) {
      res.status(403);
      throw new Error("You can only delete your own leave requests");
    }
  }

  await record.deleteOne();
  res.json({ success: true, message: "Leave request deleted" });
});

module.exports = {
  createLeaveRequest,
  getLeaveRequests,
  updateLeaveRequest,
  deleteLeaveRequest,
};
