const Machine = require("../models/Machine");

const validateMaintenanceStatus = (status, res) => {
  if (status !== undefined && !Machine.schema.path("status").enumValues.includes(status)) {
    res.status(400);
    throw new Error("Invalid machine status");
  }
};

const saveMaintenanceStatus = async (machine, status) => {
  if (status === undefined) return;
  await Machine.updateOne(
    { _id: machine._id, isDeleted: false },
    { $set: { status, statusLocked: status !== "Running" } },
    { runValidators: true }
  );
};

module.exports = { validateMaintenanceStatus, saveMaintenanceStatus };
