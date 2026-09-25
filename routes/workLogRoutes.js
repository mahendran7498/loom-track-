const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const {
  createWorkLog,
  listWorkLogs,
  getWorkLogById,
  updateWorkLog,
  deleteWorkLog,
} = require("../controllers/workLogController");

router.use(protect);

router.route("/").get(listWorkLogs).post(createWorkLog);

router
  .route("/:id")
  .get(getWorkLogById)
  .put(updateWorkLog)
  .delete(deleteWorkLog);

module.exports = router;