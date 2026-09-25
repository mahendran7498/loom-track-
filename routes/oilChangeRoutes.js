const express = require("express");
const router = express.Router();
const { protect, requireSchedulerKey } = require("../middleware/auth");
const {
  createOilChange,
  getOilChanges,
  getOilChangeById,
  updateOilChange,
  deleteOilChange,
  getDueOilChanges,
  getOilChangeDueStatus,
  markReminderSent,
} = require("../controllers/oilChangeController");

// Scheduler-only endpoints (separate auth: shared API key, no user JWT)
router.get("/due/today", requireSchedulerKey, getDueOilChanges);
router.patch("/:id/mark-reminder-sent", requireSchedulerKey, markReminderSent);

// Normal user-facing endpoints
router.use(protect);

router.get("/due-status", getOilChangeDueStatus);

router.route("/").get(getOilChanges).post(createOilChange);

router
  .route("/:id")
  .get(getOilChangeById)
  .put(updateOilChange)
  .delete(deleteOilChange);

module.exports = router;
