const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  createSparePart,
  getSpareParts,
  getSparePartById,
  updateSparePart,
  deleteSparePart,
} = require("../controllers/sparePartController");

router.use(protect);

router.route("/").get(getSpareParts).post(createSparePart);
router
  .route("/:id")
  .get(getSparePartById)
  .put(updateSparePart)
  .delete(authorize("owner"), deleteSparePart);

module.exports = router;
