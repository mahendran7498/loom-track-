const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  register,
  getManagedUsers,
  deleteOwner,
  login,
  getMe,
  changePassword,
  verifyPassword,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");

router.post("/register", protect, authorize("admin", "owner"), register);
router.get("/users", protect, authorize("admin", "owner"), getManagedUsers);
router.delete("/users/:id", protect, authorize("admin"), deleteOwner);
router.post("/login", login);
router.get("/me", protect, getMe);
router.put("/change-password", protect, changePassword);
router.post("/verify-password", protect, verifyPassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

module.exports = router;
