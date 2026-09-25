const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  createMaintenanceJob,
  getMaintenanceJobs,
  getMaintenanceJobById,
  updateMaintenanceJob,
  deleteMaintenanceJob,
} = require("../controllers/maintenanceJobController");

router.use(protect);

// A maintenance job is the employee's work report.  Employees submit their
// own report and can amend it while it is still open; the general manager
// and admin review/amend; only admin deletes reports.
router
  .route("/")
  .get(authorize("admin", "general_manager", "employee"), getMaintenanceJobs)
  .post(authorize("employee"), createMaintenanceJob);
router
  .route("/:id")
  .get(authorize("admin", "general_manager", "employee"), getMaintenanceJobById)
  .put(authorize("admin", "general_manager", "employee"), updateMaintenanceJob)
  .delete(authorize("admin"), deleteMaintenanceJob);

module.exports = router;
