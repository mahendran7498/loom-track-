const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
} = require("../controllers/employeeController");

// Employees: Admin = full control, Owner = read-only view,
// General Manager = create/edit own team, Employee = no access here.
router.use(protect);

router
  .route("/")
  .get(authorize("admin", "owner", "general_manager"), getEmployees)
  .post(authorize("admin", "general_manager"), createEmployee);

router
  .route("/:id")
  .get(authorize("admin", "owner", "general_manager"), getEmployeeById)
  .put(authorize("admin", "general_manager"), updateEmployee)
  .delete(authorize("admin"), deleteEmployee);

module.exports = router;
