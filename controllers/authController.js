const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/User");
const Employee = require("../models/Employee");

const creatableRoles = {
  admin: ["owner"],
  owner: ["general_manager"],
};

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

const resolveProfilePhoto = async (user) => {
  if (user.profilePhoto || user.role !== "employee") return user.profilePhoto || "";

  const employee = user.employee
    ? await Employee.findById(user.employee).select("profilePhoto")
    : await Employee.findOne({ user: user._id }).select("profilePhoto");

  return employee?.profilePhoto || "";
};

// @desc    Register a new user (Owner creates Employee logins; first Owner
//          account is typically seeded directly in the DB or via a setup script)
// @route   POST /api/auth/register
// @access  Owner
const register = asyncHandler(async (req, res) => {
  const { name, phoneNumber, password, role, employee } = req.body;
  const email = req.body.email?.trim().toLowerCase();
  const targetRole = role || "employee";
  const companyName = req.body.companyName?.trim();

  if (!creatableRoles[req.user.role]?.includes(targetRole)) {
    res.status(403);
    throw new Error("You are not permitted to create this account type");
  }
  if (targetRole === "owner" && !companyName) {
    res.status(400);
    throw new Error("companyName is required when creating an owner");
  }

  const existing = await User.findOne({ email });
  if (existing) {
    res.status(409);
    throw new Error("A user with this email already exists");
  }

  const user = await User.create({
    name,
    email,
    phoneNumber,
    password,
    role: targetRole,
    employee,
    createdBy: req.user._id,
    ...(targetRole === "owner" && { companyName }),
  });

  res.status(201).json({
    success: true,
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    },
  });
});

// @desc    List accounts the current role is allowed to manage
// @route   GET /api/auth/users?role=owner|general_manager
// @access  Admin, Owner
const getManagedUsers = asyncHandler(async (req, res) => {
  const managedRole = req.user.role === "admin" ? "owner" : "general_manager";
  if (req.query.role && req.query.role !== managedRole) {
    res.status(403);
    throw new Error("You are not permitted to view this account type");
  }

  const query = { role: managedRole, isActive: true };
  if (req.user.role === "owner") query.createdBy = req.user._id;

  const users = await User.find(query)
    .select("name email phoneNumber companyName role createdAt")
    .sort({ createdAt: -1 });
  res.json({ success: true, data: users });
});

// @desc    Deactivate a company owner and all accounts below it
// @route   DELETE /api/auth/users/:id
// @access  Admin
const deleteOwner = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Invalid owner ID");
  }

  const owner = await User.findOne({
    _id: req.params.id,
    role: "owner",
    isActive: true,
  });
  if (!owner) {
    res.status(404);
    throw new Error("Active company owner not found");
  }

  const generalManagers = await User.find({ createdBy: owner._id, role: "general_manager" })
    .select("_id");
  const managerIds = [owner._id, ...generalManagers.map((manager) => manager._id)];
  const employees = await Employee.find({ manager: { $in: managerIds }, isActive: true }).select("_id user");

  await Promise.all([
    User.updateOne({ _id: owner._id }, { isActive: false }),
    User.updateMany(
      { _id: { $in: generalManagers.map((manager) => manager._id) } },
      { isActive: false }
    ),
    Employee.updateMany({ _id: { $in: employees.map((employee) => employee._id) } }, { isActive: false }),
    User.updateMany(
      { _id: { $in: employees.map((employee) => employee.user).filter(Boolean) } },
      { isActive: false }
    ),
  ]);

  res.json({ success: true, message: "Company owner and related accounts deactivated" });
});

// @desc    Login (Owner or Employee)
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const identifier = req.body.identifier?.trim();
  const { password } = req.body;

  let user = null;
  if (identifier && password) {
    const employee = await Employee.findOne({ employeeId: identifier }).select("user");
    const identifiers = [
      { email: identifier.toLowerCase() },
      { phoneNumber: identifier },
      ...(mongoose.isValidObjectId(identifier) ? [{ _id: identifier }] : []),
      ...(employee?.user ? [{ _id: employee.user }] : []),
    ];
    user = await User.findOne({ $or: identifiers }).select("+password");
  }
  if (!user || !(await user.comparePassword(password))) {
    res.status(401);
    throw new Error("Invalid email or phone number, or password");
  }
  if (!user.isActive) {
    res.status(403);
    throw new Error("This account has been deactivated");
  }

  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });
  const profilePhoto = await resolveProfilePhoto(user);

  res.json({
    success: true,
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      profilePhoto,
      token: generateToken(user._id),
    },
  });
});

// @desc    Current logged-in user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = req.user.toObject();
  user.profilePhoto = await resolveProfilePhoto(req.user);
  res.json({ success: true, data: user });
});

// @desc    Change password (while logged in)
// @route   PUT /api/auth/change-password
// @access  Private (managers only — employees get their password reset by a manager)
const changePassword = asyncHandler(async (req, res) => {
  if (req.user.role === "employee") {
    res.status(403);
    throw new Error("Employees cannot change their password. Please ask your manager.");
  }

  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select("+password");

  if (!(await user.comparePassword(currentPassword))) {
    res.status(401);
    throw new Error("Current password is incorrect");
  }

  user.password = newPassword;
  await user.save();
  res.json({ success: true, message: "Password updated" });
});

// @desc    Confirm the current user's password without changing it
// @route   POST /api/auth/verify-password
// @access  Private
const verifyPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const user = await User.findById(req.user._id).select("+password");

  if (!password || !(await user.comparePassword(password))) {
    res.status(401);
    throw new Error("Password is incorrect");
  }

  res.json({ success: true, message: "Password confirmed" });
});

// @desc    Request a password reset token (emailed/SMS'd to the user in prod)
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    // Don't reveal whether the email exists
    return res.json({ success: true, message: "If that email exists, a reset link was sent" });
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
  user.resetPasswordExpires = Date.now() + 30 * 60 * 1000; // 30 min
  await user.save({ validateBeforeSave: false });

  // TODO: send resetToken via email/SMS through the notification service
  res.json({
    success: true,
    message: "If that email exists, a reset link was sent",
    // resetToken is only returned here for local dev/testing convenience.
    ...(process.env.NODE_ENV !== "production" && { devResetToken: resetToken }),
  });
});

// @desc    Reset password using token from forgotPassword
// @route   POST /api/auth/reset-password/:token
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() },
  }).select("+resetPasswordToken +resetPasswordExpires");

  if (!user) {
    res.status(400);
    throw new Error("Reset token is invalid or has expired");
  }

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  res.json({ success: true, message: "Password reset successful" });
});

module.exports = {
  register,
  getManagedUsers,
  deleteOwner,
  login,
  getMe,
  changePassword,
  verifyPassword,
  forgotPassword,
  resetPassword,
};
