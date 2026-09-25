const express = require("express");
const router = express.Router();
const { protect, authorize, requireSchedulerKey } = require("../middleware/auth");
const { requestReport, getReports, downloadReport, deleteReport, completeReport } = require("../controllers/reportController");

router.patch("/:id/complete", requireSchedulerKey, completeReport);

router.use(protect);
// Report access: admin sees everything, owner & manager view/export,
// employees only see their own generated reports.
const REPORT_ROLES = ["admin", "employee", "general_manager", "owner"];
router.route("/").get(authorize(...REPORT_ROLES), getReports).post(authorize(...REPORT_ROLES), requestReport);

module.exports = router;
