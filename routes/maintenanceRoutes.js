const express = require("express");
const router = express.Router();
const { protect, authorize, requireSchedulerKey } = require("../middleware/auth");
const {
  createMaintenance,
  getMaintenanceRecords,
  getMaintenanceById,
  updateMaintenance,
  deleteMaintenance,
  getDueMaintenance,
  markReminderSent,
} = require("../controllers/maintenanceController");

router.get("/due/today", requireSchedulerKey, getDueMaintenance);
router.patch("/:id/mark-reminder-sent", requireSchedulerKey, markReminderSent);

router.use(protect);

router.route("/").get(getMaintenanceRecords).post(createMaintenance);
router
  .route("/:id")
  .get(getMaintenanceById)
  .put(updateMaintenance)
  .delete(authorize("admin"), deleteMaintenance); // only admin may delete maintenance

module.exports = router;
