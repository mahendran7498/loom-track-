const express = require("express");
const router = express.Router();
const { protect, requireSchedulerKey } = require("../middleware/auth");
const {
  ingestNotification,
  getNotifications,
  markAsRead,
} = require("../controllers/notificationController");

router.post("/ingest", requireSchedulerKey, ingestNotification);

router.use(protect);
router.get("/", getNotifications);
router.patch("/:id/read", markAsRead);

module.exports = router;
