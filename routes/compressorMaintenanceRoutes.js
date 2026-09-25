const express = require("express");
const router = express.Router();
const { protect, requireSchedulerKey } = require("../middleware/auth");
const {
  createCompressorMaintenance,
  getCompressorMaintenanceRecords,
  getCompressorMaintenanceById,
  updateCompressorMaintenance,
  deleteCompressorMaintenance,
  getCompressorSchedule,
  getDueCompressorMaintenance,
  markCompressorReminderSent,
} = require("../controllers/compressorMaintenanceController");

router.get("/due/today", requireSchedulerKey, getDueCompressorMaintenance);
router.patch("/:id/mark-reminder-sent", requireSchedulerKey, markCompressorReminderSent);

router.use(protect);

router.get("/schedule", getCompressorSchedule);
router
  .route("/")
  .get(getCompressorMaintenanceRecords)
  .post(createCompressorMaintenance);
router
  .route("/:id")
  .get(getCompressorMaintenanceById)
  .put(updateCompressorMaintenance)
  .delete(deleteCompressorMaintenance);

module.exports = router;