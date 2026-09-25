const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { getDashboardStats } = require("../controllers/dashboardController");

router.use(protect);
router.get("/", getDashboardStats);

module.exports = router;
