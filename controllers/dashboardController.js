const asyncHandler = require("express-async-handler");
const Machine = require("../models/Machine");
const Employee = require("../models/Employee");
const Maintenance = require("../models/Maintenance");
const MaintenanceJob = require("../models/MaintenanceJob");
const OilChange = require("../models/OilChange");
const ActivityLog = require("../models/ActivityLog");
const User = require("../models/User");
const CompressorMaintenance = require("../models/CompressorMaintenance");
const AirDryerMaintenance = require("../models/AirDryerMaintenance");

const getDashboardStats = asyncHandler(async (req, res) => {
  const role = req.user.role;

  // Employees only see the looms assigned to them.
  let machineScope = {};
  let employeeProfile = null;
  if (role === "employee") {
    employeeProfile = await Employee.findOne({ user: req.user._id });
    machineScope._id = { $in: employeeProfile ? employeeProfile.assignedMachines : [] };
  }
  const machineQuery = { isDeleted: false, ...machineScope };

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 6);
  startOfWeek.setHours(0, 0, 0, 0);

  const downtimeRanges = [
    { key: "today", days: 1, start: startOfToday },
    { key: "days7", days: 7, start: startOfWeek },
    { key: "days30", days: 30, start: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000) },
  ];
  downtimeRanges.forEach((r) => r.start.setHours(0, 0, 0, 0));

  const [downtimeAnalytics, maintenanceStatus] = await Promise.all([
    Promise.all(
      downtimeRanges.map((range) =>
        Maintenance.aggregate([
          {
            $match: {
              ...machineScope,
              maintenanceDate: { $gte: range.start, $lte: endOfToday },
              maintenanceType: {
                $in: ["Breakdown", "Idle", "Corrective", "Preventive", "Inspection"],
              },
            },
          },
          {
            $group: {
              _id: "$maintenanceType",
              count: { $sum: 1 },
            },
          },
        ])
      )
    ),
    Promise.all([
      Maintenance.countDocuments({
        ...machineScope,
        nextMaintenanceDate: { $lt: startOfToday, $ne: null },
      }),
      Maintenance.countDocuments({
        ...machineScope,
        nextMaintenanceDate: { $gte: startOfToday, $lte: endOfToday },
      }),
      Maintenance.countDocuments({
        ...machineScope,
        nextMaintenanceDate: { $gt: endOfToday, $lte: addDays(startOfToday, 7), $ne: null },
      }),
      Maintenance.countDocuments({
        ...machineScope,
        nextMaintenanceDate: { $gt: addDays(startOfToday, 7), $ne: null },
      }),
    ]),
  ]);

  const [
    totalMachines,
    runningMachines,
    stoppedMachines,
    breakdownMachines,
    underMaintenanceMachines,
    idleMachines,
    totalEmployees,
    maintenanceDue,
    oilChangeDue,
    compressorDue,
    airDryerDue,
    downtimeAgg,
    todayDowntimeEvents,
    monthDowntimeEvents,
    recentActivity,
    sectionStats,
    recentMaintenance,
    recentWorkReports,
    totalOwners,
    liveLooms,
    activeBreakdowns,
    workStatusAgg,
    categoryAgg,
  ] = await Promise.all([
    Machine.countDocuments(machineQuery),
    Machine.countDocuments({ ...machineQuery, status: "Running" }),
    Machine.countDocuments({ ...machineQuery, status: "Stopped" }),
    Machine.countDocuments({ ...machineQuery, status: "Breakdown" }),
    Machine.countDocuments({ ...machineQuery, status: "Under Maintenance" }),
    Machine.countDocuments({ ...machineQuery, status: "Idle" }),
    Employee.countDocuments({ isActive: true }),
    Maintenance.countDocuments({
      ...(role === "employee" ? { machine: { $in: machineScope._id?.$in || [] } } : {}),
      nextMaintenanceDate: { $lte: endOfToday, $ne: null },
    }),
    OilChange.countDocuments({
      ...(role === "employee" ? { machine: { $in: machineScope._id?.$in || [] } } : {}),
      nextOilChangeDate: { $lte: endOfToday },
      reminderSent: false,
    }),
    CompressorMaintenance.countDocuments({
      ...(role === "employee" ? { machine: { $in: machineScope._id?.$in || [] } } : {}),
      nextMaintenanceDate: { $lte: endOfToday, $ne: null },
      reminderSent: false,
    }),
    AirDryerMaintenance.countDocuments({
      ...(role === "employee" ? { machine: { $in: machineScope._id?.$in || [] } } : {}),
      nextMaintenanceDate: { $lte: endOfToday, $ne: null },
      reminderSent: false,
    }),
    Machine.aggregate([
      { $match: machineQuery },
      { $group: { _id: null, totalDowntimeMinutes: { $sum: { $ifNull: ["$totalDowntime", 0] } } } },
    ]),
    Maintenance.countDocuments({
      ...machineScope,
      maintenanceType: { $in: ["Breakdown", "Idle", "Corrective"] },
      maintenanceDate: { $gte: startOfToday, $lte: endOfToday },
    }),
    Maintenance.countDocuments({
      ...machineScope,
      maintenanceType: { $in: ["Breakdown", "Idle", "Corrective"] },
      maintenanceDate: { $gte: startOfMonth },
    }),
    ActivityLog.find().sort({ createdAt: -1 }).limit(10).populate("user", "name role"),
    Machine.aggregate([
      { $match: machineQuery },
      {
        $group: {
          _id: { $ifNull: ["$section", "Unassigned"] },
          total: { $sum: 1 },
          running: { $sum: { $cond: [{ $eq: ["$status", "Running"] }, 1, 0] } },
          stopped: { $sum: { $cond: [{ $eq: ["$status", "Stopped"] }, 1, 0] } },
          breakdown: { $sum: { $cond: [{ $eq: ["$status", "Breakdown"] }, 1, 0] } },
          maintenance: {
            $sum: { $cond: [{ $eq: ["$status", "Under Maintenance"] }, 1, 0] },
          },
          idle: { $sum: { $cond: [{ $eq: ["$status", "Idle"] }, 1, 0] } },
        },
      },
      { $sort: { total: -1 } },
    ]),
    Maintenance.find({ ...machineScope })
      .populate("machine", "machineName machineNumber section")
      .sort({ maintenanceDate: -1 })
      .limit(5),
    MaintenanceJob.find({ ...machineScope })
      .populate("machine", "machineName machineNumber section")
      .populate("performedBy", "name employeeId")
      .sort({ createdAt: -1 })
      .limit(5),
    role === "admin"
      ? User.countDocuments({ role: "owner", isActive: true })
      : Promise.resolve(0),
    Machine.find({
      ...machineQuery,
      // Live monitoring shows all looms in scope, most recently active first.
    })
      .populate("assignedEmployees", "name")
      .sort({ updatedAt: -1 })
      .limit(50),
    Machine.find({ ...machineQuery, status: "Breakdown" })
      .populate("assignedEmployees", "name")
      .sort({ updatedAt: -1 }),
    Maintenance.aggregate([
      {
        $match: {
          ...machineScope,
          ...(role === "employee" && employeeProfile
            ? {
                $or: [
                  { performedBy: employeeProfile._id },
                  { machine: { $in: machineScope._id?.$in || [] } },
                ],
              }
            : {}),
        },
      },
      {
        $group: {
          _id: "$approvalStatus",
          count: { $sum: 1 },
        },
      },
    ]),
    Machine.aggregate([
      { $match: machineQuery },
      {
        $group: {
          _id: { $ifNull: ["$machineCategory", "loom"] },
          total: { $sum: 1 },
          running: { $sum: { $cond: [{ $eq: ["$status", "Running"] }, 1, 0] } },
          stopped: { $sum: { $cond: [{ $eq: ["$status", "Stopped"] }, 1, 0] } },
          breakdown: { $sum: { $cond: [{ $eq: ["$status", "Breakdown"] }, 1, 0] } },
          maintenance: {
            $sum: { $cond: [{ $eq: ["$status", "Under Maintenance"] }, 1, 0] },
          },
          idle: { $sum: { $cond: [{ $eq: ["$status", "Idle"] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const totalDowntimeMinutes = downtimeAgg[0]?.totalDowntimeMinutes || 0;
  const efficiency = totalMachines
    ? Math.round((runningMachines / totalMachines) * 100)
    : 0;

  const sectionStatsWithEfficiency = sectionStats.map((s) => ({
    ...s,
    efficiency: s.total ? Math.round((s.running / s.total) * 100) : 0,
  }));

  const workStatus = {
    submitted: workStatusAgg.find((w) => w._id === "Submitted")?.count || 0,
    approved: workStatusAgg.find((w) => w._id === "Approved")?.count || 0,
    rejected: workStatusAgg.find((w) => w._id === "Rejected")?.count || 0,
  };

  const mapsDowntime = downtimeAnalytics.map((result, index) => {
    const aggregate = result.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});
    const breakdown = (aggregate.Breakdown || 0) + (aggregate.Corrective || 0);
    const idle = aggregate.Idle || 0;
    const maintenance = (aggregate.Preventive || 0) + (aggregate.Inspection || 0);
    return {
      days: downtimeRanges[index].days,
      total: breakdown + idle + maintenance,
      breakdown,
      idle,
      maintenance,
    };
  });

  const parseMillisAgo = (date) =>
    (date ? Math.max(0, Date.now() - new Date(date).getTime()) : 0);

  const categoryKeys = ["loom", "compressor", "air_dryer", "other"];
  const categoryStats = categoryKeys.map((key) => {
    const row = categoryAgg.find((c) => c._id === key) || {};
    const total = row.total || 0;
    return {
      category: key,
      total,
      running: row.running || 0,
      stopped: row.stopped || 0,
      breakdown: row.breakdown || 0,
      maintenance: row.maintenance || 0,
      idle: row.idle || 0,
      efficiency: total ? Math.round(((row.running || 0) / total) * 100) : 0,
    };
  });
  const typeCounts = categoryStats.reduce(
    (acc, s) => ({ ...acc, [s.category]: s.total }),
    { loom: 0, compressor: 0, air_dryer: 0, other: 0 }
  );

  res.json({
    success: true,
    data: {
      totalOwners,
      totalLooms: typeCounts.loom,
      totalMachines,
      totalCompressors: typeCounts.compressor,
      totalAirDryers: typeCounts.air_dryer,
      runningMachines,
      stoppedMachines,
      breakdownMachines,
      underMaintenanceMachines,
      maintenanceLooms: underMaintenanceMachines,
      idleMachines,
      totalEmployees,
      maintenanceDue,
      oilChangeDue,
      compressorDue,
      airDryerDue,
      todayDowntimeEvents,
      monthDowntimeEvents,
      totalDowntimeMinutes,
      efficiency,
      sectionStats: sectionStatsWithEfficiency,
      recentActivity,
      recentMaintenance,
      recentWorkReports,
      downtimeAnalytics: mapsDowntime,
      maintenanceStatus: {
        overdue: maintenanceStatus[0],
        dueToday: maintenanceStatus[1],
        dueThisWeek: maintenanceStatus[2],
        upcoming: maintenanceStatus[3],
      },
      workStatus,
      categoryStats,
      typeCounts,
      liveLooms: liveLooms.map((machine) => ({
        _id: machine._id,
        machineName: machine.machineName,
        machineNumber: machine.machineNumber,
        machineCategory: machine.machineCategory || "loom",
        section: machine.section,
        shed: machine.shed,
        loomType: machine.loomType,
        status: machine.status,
        runningHours: machine.runningHours || 0,
        totalDowntime: machine.totalDowntime || 0,
        assignedEngineer: machine.assignedEngineer,
        currentEmployee:
          (machine.assignedEmployees || []).map((e) => e.name).filter(Boolean).join(", ") ||
          null,
        lastUpdated: machine.updatedAt,
        lastUpdatedAgo: Math.round(parseMillisAgo(machine.updatedAt) / 60000),
      })),
      activeBreakdowns: activeBreakdowns.map((machine) => ({
        _id: machine._id,
        machineName: machine.machineName,
        machineNumber: machine.machineNumber,
        machineCategory: machine.machineCategory || "loom",
        section: machine.section,
        shed: machine.shed,
        status: machine.status,
        assignedEngineer: machine.assignedEngineer,
        currentEmployee:
          (machine.assignedEmployees || []).map((e) => e.name).filter(Boolean).join(", ") ||
          null,
        breakdownMinutes: Math.round(parseMillisAgo(machine.updatedAt) / 60000),
        lastUpdated: machine.updatedAt,
      })),
    },
  });
});

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

module.exports = { getDashboardStats };
