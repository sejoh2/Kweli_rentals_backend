const moverService = require("../services/mover.service");

const parseJson = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
};

const parseWorkingHours = (body) => {
  const parsed = parseJson(body.working_hours, null);

  if (parsed) return parsed;

  return {
    from: body.working_hours_from || body.from_time || body.fromTime || null,
    to: body.working_hours_to || body.to_time || body.toTime || null
  };
};

const getMyMoverProfile = async (req, res) => {
  try {
    const profile = await moverService.getMoverProfileByUserId(req.user.user_id);

    if (!profile) {
      return res.json({
        success: true,
        is_registered: false,
        registration_status: "not_registered",
        can_access_dashboard: false,
        profile: null
      });
    }

    res.json({
      success: true,
      is_registered: true,
      registration_status: profile.registration_status,
      can_access_dashboard: profile.registration_status === "verified",
      profile
    });
  } catch (error) {
    console.error("Error getting mover profile:", error);
    res.status(500).json({ error: error.message });
  }
};

const registerMover = async (req, res) => {
  try {
    if (req.user.role !== "movers") {
      return res.status(403).json({ error: "Only movers can register mover profiles" });
    }

    const body = req.body;

    if (!body.company_name || body.company_name.trim() === "") {
      return res.status(400).json({ error: "Company name is required" });
    }

    const existingProfile = await moverService.getMoverProfileByUserId(req.user.user_id);
    const existingDocs = new Set(
      (existingProfile?.documents || []).map((doc) => doc.document_type)
    );

    if (!req.files?.insurance_policy?.[0] && !existingDocs.has("insurance_policy")) {
      return res.status(400).json({ error: "Insurance policy document is required" });
    }

    if (!req.files?.owner_id_document?.[0] && !existingDocs.has("owner_id_document")) {
      return res.status(400).json({ error: "Owner or representative ID document is required" });
    }

    const data = {
      company_name: body.company_name.trim(),
      license_number: body.license_number,
      years_in_operation: body.years_in_operation,
      business_address: body.business_address,
      business_phone: body.business_phone,
      business_email: body.business_email,
      website: body.website,
      base_location: body.base_location,
      service_areas: parseJson(body.service_areas, []),
      moving_types: parseJson(body.moving_types, []),
      fleet_details: parseJson(body.fleet_details, []),
      base_fee: body.base_fee,
      rate_per_km: body.rate_per_km,
      hourly_rate: body.hourly_rate,
      notice_period_days: body.notice_period_days,
      working_hours: parseWorkingHours(body)
    };

    const profile = await moverService.registerMover(req.user.user_id, data, req.files);

    res.status(201).json({
      success: true,
      message: "Mover registration submitted successfully. Awaiting admin verification.",
      registration_status: profile.registration_status,
      profile
    });
  } catch (error) {
    console.error("Error registering mover:", error);
    res.status(500).json({ error: error.message });
  }
};

const updateCompanyDetails = async (req, res) => {
  try {
    const updates = {
      company_name: req.body.company_name,
      license_number: req.body.license_number,
      years_in_operation: req.body.years_in_operation,
      business_address: req.body.business_address,
      business_phone: req.body.business_phone,
      business_email: req.body.business_email,
      website: req.body.website
    };

    const profile = await moverService.updateMoverProfile(req.user.user_id, updates);

    res.json({
      success: true,
      message: "Company details updated successfully",
      profile
    });
  } catch (error) {
    console.error("Error updating mover company details:", error);
    res.status(500).json({ error: error.message });
  }
};

const updateServiceAreas = async (req, res) => {
  try {
    const profile = await moverService.updateMoverProfile(req.user.user_id, {
      base_location: req.body.base_location,
      service_areas: req.body.service_areas || []
    });

    res.json({
      success: true,
      message: "Service areas updated successfully",
      profile
    });
  } catch (error) {
    console.error("Error updating mover service areas:", error);
    res.status(500).json({ error: error.message });
  }
};

const updateFleetPricing = async (req, res) => {
  try {
    const profile = await moverService.updateMoverProfile(req.user.user_id, {
      moving_types: req.body.moving_types || [],
      fleet_details: req.body.fleet_details || [],
      base_fee: req.body.base_fee,
      rate_per_km: req.body.rate_per_km,
      hourly_rate: req.body.hourly_rate,
      notice_period_days: req.body.notice_period_days
    });

    res.json({
      success: true,
      message: "Fleet and pricing updated successfully",
      profile
    });
  } catch (error) {
    console.error("Error updating mover fleet pricing:", error);
    res.status(500).json({ error: error.message });
  }
};

const updateAvailability = async (req, res) => {
  try {
    const profile = await moverService.updateMoverProfile(req.user.user_id, {
      working_hours: req.body.working_hours || parseWorkingHours(req.body)
    });

    res.json({
      success: true,
      message: "Availability updated successfully",
      profile
    });
  } catch (error) {
    console.error("Error updating mover availability:", error);
    res.status(500).json({ error: error.message });
  }
};

const uploadDocuments = async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ error: "No documents uploaded" });
    }

    const profile = await moverService.uploadMoverDocuments(req.user.user_id, req.files);

    res.json({
      success: true,
      message: "Mover documents uploaded successfully",
      profile
    });
  } catch (error) {
    console.error("Error uploading mover documents:", error);
    res.status(500).json({ error: error.message });
  }
};

const getPendingMovers = async (req, res) => {
  try {
    const pending = await moverService.getPendingMoverProfiles();

    res.json({
      success: true,
      count: pending.length,
      pending_movers: pending
    });
  } catch (error) {
    console.error("Error getting pending movers:", error);
    res.status(500).json({ error: error.message });
  }
};

const getMoverForAdmin = async (req, res) => {
  try {
    const { moverId } = req.params;
    const profile = await moverService.getMoverProfileById(moverId);

    if (!profile) {
      return res.status(404).json({ error: "Mover profile not found" });
    }

    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error("Error getting mover for admin:", error);
    res.status(500).json({ error: error.message });
  }
};

const approveMover = async (req, res) => {
  try {
    const { moverId } = req.params;
    const { notes } = req.body;

    const profile = await moverService.approveMoverProfile(
      moverId,
      req.user.user_id,
      notes || null
    );

    res.json({
      success: true,
      message: `${profile.company_name} has been verified successfully`,
      profile
    });
  } catch (error) {
    console.error("Error approving mover:", error);
    res.status(500).json({ error: error.message });
  }
};

const rejectMover = async (req, res) => {
  try {
    const { moverId } = req.params;
    const { reason } = req.body;

    const profile = await moverService.rejectMoverProfile(
      moverId,
      reason || "No reason provided",
      req.user.user_id
    );

    res.json({
      success: true,
      message: `Mover verification rejected${reason ? `: ${reason}` : ""}`,
      profile
    });
  } catch (error) {
    console.error("Error rejecting mover:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getMyMoverProfile,
  registerMover,
  updateCompanyDetails,
  updateServiceAreas,
  updateFleetPricing,
  updateAvailability,
  uploadDocuments,
  getPendingMovers,
  getMoverForAdmin,
  approveMover,
  rejectMover
};