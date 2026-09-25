const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");

const ROLES = Object.freeze({
  ADMIN: "admin",
  OWNER: "owner",
  GENERAL_MANAGER: "general_manager",
  EMPLOYEE: "employee",
});

// Verifies the JWT and attaches req.user
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    res.status(401);
    throw new Error("Not authorized, no token provided");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user || !req.user.isActive) {
      res.status(401);
      throw new Error("Not authorized, user not found or inactive");
    }
    next();
  } catch (error) {
    res.status(401);
    throw new Error("Not authorized, token invalid or expired");
  }
});

// Restrict a route to specific roles, e.g. authorize("owner")
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    res.status(403);
    throw new Error(
      `Role '${req.user.role}' is not permitted to perform this action`
    );
  }
  next();
};

// For the Python scheduler's internal calls (not a real user session)
const requireSchedulerKey = (req, res, next) => {
  const key = req.headers["x-scheduler-key"];
  if (!key || key !== process.env.SCHEDULER_API_KEY) {
    res.status(401);
    throw new Error("Invalid or missing scheduler API key");
  }
  next();
};

module.exports = { protect, authorize, requireSchedulerKey, ROLES };
