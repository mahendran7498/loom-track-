const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  createMachine,
  getMachineCompanies,
  getCompanyLayout,
  saveCompanyLayout,
  getMachines,
  getMachineById,
  updateMachine,
  updateMachineLayout,
  updateMachineStatus,
  deleteMachine,
  assignMachine,
  addMachineDocuments,
  removeMachineDocument,
} = require("../controllers/machineController");

router.use(protect);

router
  .route("/")
  .get(getMachines)
  .post(authorize("admin"), createMachine);

router.get("/companies", getMachineCompanies);
router.get("/company-layout", getCompanyLayout);
router.put("/company-layout", authorize("admin"), saveCompanyLayout);

router
  .route("/:id")
  .get(getMachineById)
  .put(authorize("admin"), updateMachine)
  .delete(authorize("admin"), deleteMachine);

router.patch("/:id/layout", authorize("admin"), updateMachineLayout);
router.patch("/:id/status", updateMachineStatus); // admin or assigned employee
router.post("/:id/assign", authorize("admin"), assignMachine);
router.post("/:id/documents", addMachineDocuments);
router.delete("/:id/documents", removeMachineDocument);

module.exports = router;
