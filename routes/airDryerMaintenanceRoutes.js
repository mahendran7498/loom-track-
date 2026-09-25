const express = require("express");
const router = express.Router();
const { protect, requireSchedulerKey } = require("../middleware/auth");
const {
  createAirDryerMaintenance,
  getAirDryerMaintenanceRecords,
  getAirDryerMaintenanceById,
  updateAirDryerMaintenance,
  deleteAirDryerMaintenance,
  getAirDryerSchedule,
  getDueAirDryerMaintenance,
  markAirDryerReminderSent,
} = require("../controllers/airDryerMaintenanceController");

router.get("/due/today", requireSchedulerKey, getDueAirDryerMaintenance);
router.patch("/:id/mark-reminder-sent", requireSchedulerKey, markAirDryerReminderSent);

router.use(protect);

router.get("/schedule", getAirDryerSchedule);
router
  .route("/")
  .get(getAirDryerMaintenanceRecords)
  .post(createAirDryerMaintenance);
router
  .route("/:id")
  .get(getAirDryerMaintenanceById)
  .put(updateAirDryerMaintenance)
  .delete(deleteAirDryerMaintenance);

module.exports = router;