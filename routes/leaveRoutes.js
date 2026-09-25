const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  createLeaveRequest,
  getLeaveRequests,
  updateLeaveRequest,
  deleteLeaveRequest,
} = require("../controllers/leaveController");

router.use(protect);

router
  .route("/")
  .get(authorize("owner", "general_manager", "employee"), getLeaveRequests)
  .post(authorize("employee"), createLeaveRequest);

router
  .route("/:id")
  .put(authorize("owner", "general_manager", "employee"), updateLeaveRequest)
  .delete(authorize("owner", "general_manager", "employee"), deleteLeaveRequest);

module.exports = router;
