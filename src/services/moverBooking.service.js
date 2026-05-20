const pool = require("../config/db");
const { getIO } = require("./websocket.service");

const PLATFORM_FEE_RATE = Number(process.env.MOVER_PLATFORM_FEE_RATE || 0.1);

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const inventoryMultiplier = (inventorySize) => {
  const key = `${inventorySize || ""}`.trim().toLowerCase();

  if (key === "studio") return 1.0;
  if (key === "1 bedroom") return 1.2;
  if (key === "2 bedroom") return 1.5;
  if (key === "3 bedroom") return 1.8;
  if (key === "bungalow") return 2.0;

  return 1.0;
};

const calculateEstimate = (moverProfile, data) => {
  const baseFee = toNumber(moverProfile.base_fee);
  const ratePerKm = toNumber(moverProfile.rate_per_km);
  const distanceKm = toNumber(data.distance_km, 10);
  const multiplier = inventoryMultiplier(data.inventory_size);

  return Number((baseFee + distanceKm * ratePerKm * multiplier).toFixed(2));
};

const emitToUser = (userId, event, payload) => {
  try {
    getIO().to(`user:${userId}`).emit(event, payload);
  } catch (_) {}
};

const formatFleetDetails = (fleetDetails) => {
  if (!Array.isArray(fleetDetails)) return [];

  return fleetDetails.map((item) => {
    if (typeof item === "string") return item;

    const type = item.type || item.title || item.name || "Vehicle";
    const quantity = item.quantity ? ` x ${item.quantity}` : "";
    return `${type}${quantity}`;
  });
};

const formatMoverForHomefinder = (row) => {
  const baseFee = toNumber(row.base_fee);
  const ratePerKm = toNumber(row.rate_per_km);
  const minPrice = Number((baseFee + ratePerKm * 10).toFixed(2));
  const maxPrice = Number((baseFee + ratePerKm * 10 * 2).toFixed(2));
  const rating = toNumber(row.average_rating);

  return {
    id: row.id,
    companyName: row.company_name,
    logoUrl: row.business_logo_url || "",
    status: rating >= 4.5 ? "TOPRATED" : "AVAILABLE",
    rating,
    ratingCount: Number(row.rating_count || 0),
    completedTrips: Number(row.completed_trips || 0),
    minPrice,
    maxPrice,
    businessLicenseNumber: row.license_number || "",
    yearsInOperation: Number(row.years_in_operation || 0),
    serviceAreas: row.service_areas || [],
    movingTypes: row.moving_types || [],
    fleetDetails: formatFleetDetails(row.fleet_details || []),
    baseFee,
    ratePerKm,
    hourlyRate: row.hourly_rate === null ? null : toNumber(row.hourly_rate),
    additionalCharges: {},
    insurancePolicy: "",
    businessOwnerId: row.owner_user_id,
    certifications: [],
    businessAddress: row.business_address || "",
    phoneNumber: row.business_phone || "",
    supportEmail: row.business_email || "",
    website: row.website || "",
    workingHours: row.working_hours || {},
    noticePeriod: row.notice_period_days ? `${row.notice_period_days} days` : "",
    reviews: row.reviews || []
  };
};

async function getVerifiedMovers(filters = {}) {
  const values = [];
  let where = `WHERE mp.registration_status = 'verified'`;

  if (filters.service_area) {
    values.push(filters.service_area);
    where += ` AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(mp.service_areas) area
      WHERE area ILIKE '%' || $${values.length} || '%'
    )`;
  }

  if (filters.moving_type) {
    values.push(filters.moving_type);
    where += ` AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(mp.moving_types) type
      WHERE type ILIKE '%' || $${values.length} || '%'
    )`;
  }

  if (filters.search) {
    values.push(filters.search);
    where += ` AND (
      mp.company_name ILIKE '%' || $${values.length} || '%'
      OR mp.business_address ILIKE '%' || $${values.length} || '%'
      OR mp.base_location ILIKE '%' || $${values.length} || '%'
    )`;
  }

  const result = await pool.query(
    `
    SELECT
      mp.*,
      COALESCE(completed.completed_trips, 0) AS completed_trips,
      COALESCE(ratings.average_rating, 0) AS average_rating,
      COALESCE(ratings.rating_count, 0) AS rating_count,
      COALESCE(recent_reviews.reviews, '[]'::jsonb) AS reviews
    FROM mover_profiles mp
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS completed_trips
      FROM mover_bookings mb
      WHERE mb.mover_profile_id = mp.id
        AND mb.status = 'completed'
    ) completed ON true
    LEFT JOIN LATERAL (
      SELECT
        ROUND(AVG(mr.rating)::numeric, 1) AS average_rating,
        COUNT(*)::int AS rating_count
      FROM mover_reviews mr
      WHERE mr.mover_profile_id = mp.id
    ) ratings ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(review_data ORDER BY created_at DESC) AS reviews
      FROM (
        SELECT
          mr.created_at,
          jsonb_build_object(
            'id', mr.id,
            'customerName', u.full_name,
            'comment', COALESCE(mr.comment, ''),
            'date', mr.created_at
          ) AS review_data
        FROM mover_reviews mr
        JOIN users u ON u.user_id = mr.homefinder_user_id
        WHERE mr.mover_profile_id = mp.id
        ORDER BY mr.created_at DESC
        LIMIT 3
      ) r
    ) recent_reviews ON true
    ${where}
    ORDER BY COALESCE(ratings.average_rating, 0) DESC, mp.created_at DESC
    `,
    values
  );

  return result.rows.map(formatMoverForHomefinder);
}

async function getVerifiedMoverById(moverId) {
  const result = await pool.query(
    `
    SELECT
      mp.*,
      COALESCE(completed.completed_trips, 0) AS completed_trips,
      COALESCE(ratings.average_rating, 0) AS average_rating,
      COALESCE(ratings.rating_count, 0) AS rating_count,
      COALESCE(recent_reviews.reviews, '[]'::jsonb) AS reviews
    FROM mover_profiles mp
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS completed_trips
      FROM mover_bookings mb
      WHERE mb.mover_profile_id = mp.id
        AND mb.status = 'completed'
    ) completed ON true
    LEFT JOIN LATERAL (
      SELECT
        ROUND(AVG(mr.rating)::numeric, 1) AS average_rating,
        COUNT(*)::int AS rating_count
      FROM mover_reviews mr
      WHERE mr.mover_profile_id = mp.id
    ) ratings ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(review_data ORDER BY created_at DESC) AS reviews
      FROM (
        SELECT
          mr.created_at,
          jsonb_build_object(
            'id', mr.id,
            'customerName', u.full_name,
            'comment', COALESCE(mr.comment, ''),
            'date', mr.created_at
          ) AS review_data
        FROM mover_reviews mr
        JOIN users u ON u.user_id = mr.homefinder_user_id
        WHERE mr.mover_profile_id = mp.id
        ORDER BY mr.created_at DESC
        LIMIT 10
      ) r
    ) recent_reviews ON true
    WHERE mp.id = $1
      AND mp.registration_status = 'verified'
    `,
    [moverId]
  );

  return result.rows[0] ? formatMoverForHomefinder(result.rows[0]) : null;
}

async function getRawVerifiedMoverById(moverId) {
  const result = await pool.query(
    `
    SELECT *
    FROM mover_profiles
    WHERE id = $1
      AND registration_status = 'verified'
    `,
    [moverId]
  );

  return result.rows[0] || null;
}

async function getBookingById(bookingId) {
  const result = await pool.query(
    `
    SELECT
      mb.*,
      mp.company_name,
      mp.business_logo_url,
      hf.full_name AS homefinder_name,
      hf.phone_number AS homefinder_phone,
      hf.profile_image_url AS homefinder_profile_image_url
    FROM mover_bookings mb
    JOIN mover_profiles mp ON mp.id = mb.mover_profile_id
    JOIN users hf ON hf.user_id = mb.homefinder_user_id
    WHERE mb.id = $1
    `,
    [bookingId]
  );

  return result.rows[0] || null;
}

async function createMoverBooking(homefinderUserId, data) {
  const moverId = data.mover_id || data.mover_profile_id;
  const mover = await getRawVerifiedMoverById(moverId);

  if (!mover) {
    throw new Error("Mover not found or not available for booking");
  }

  if (!data.pickup_address || !data.delivery_address || !data.move_date || !data.move_time) {
    throw new Error("Pickup address, delivery address, move date, and move time are required");
  }

  const estimatedPrice = calculateEstimate(mover, data);
  const distanceKm = toNumber(data.distance_km, 10);

  const result = await pool.query(
    `
    INSERT INTO mover_bookings (
      homefinder_user_id,
      mover_profile_id,
      mover_user_id,
      pickup_address,
      delivery_address,
      move_date,
      move_time,
      inventory_size,
      distance_km,
      estimated_price,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending_mover_confirmation')
    RETURNING id
    `,
    [
      homefinderUserId,
      mover.id,
      mover.owner_user_id,
      data.pickup_address,
      data.delivery_address,
      data.move_date,
      data.move_time,
      data.inventory_size || null,
      distanceKm,
      estimatedPrice
    ]
  );

  const booking = await getBookingById(result.rows[0].id);

  emitToUser(mover.owner_user_id, "new_mover_booking_request", { booking });
  emitToUser(homefinderUserId, "mover_booking_created", { booking });
  await emitMoverDashboardUpdate(mover.owner_user_id);

  return booking;
}

async function getMoverDashboard(moverUserId) {
  const profileResult = await pool.query(
    `
    SELECT *
    FROM mover_profiles
    WHERE owner_user_id = $1
    `,
    [moverUserId]
  );

  const profile = profileResult.rows[0];

  if (!profile) {
    return {
      stats: {
        new_requests: 0,
        new_bookings_this_week: 0,
        completed_trips: 0,
        average_rating: 0,
        rating_count: 0,
        earnings_this_month: 0
      },
      today_booking: null
    };
  }

  const statsResult = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE mb.status = 'pending_mover_confirmation')::int AS new_requests,
      COUNT(*) FILTER (
        WHERE mb.status = 'confirmed'
          AND mb.created_at >= date_trunc('week', CURRENT_TIMESTAMP)
      )::int AS new_bookings_this_week,
      COUNT(*) FILTER (WHERE mb.status = 'completed')::int AS completed_trips
    FROM mover_bookings mb
    WHERE mb.mover_profile_id = $1
    `,
    [profile.id]
  );

  const ratingResult = await pool.query(
    `
    SELECT
      COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS average_rating,
      COUNT(*)::int AS rating_count
    FROM mover_reviews
    WHERE mover_profile_id = $1
    `,
    [profile.id]
  );

  const earningsResult = await pool.query(
    `
    SELECT COALESCE(SUM(net_amount), 0) AS earnings_this_month
    FROM mover_earnings
    WHERE mover_profile_id = $1
      AND status != 'cancelled'
      AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)
    `,
    [profile.id]
  );

  const todayResult = await pool.query(
    `
    SELECT *
    FROM mover_bookings
    WHERE mover_profile_id = $1
      AND move_date = CURRENT_DATE
      AND status IN ('confirmed', 'in_progress')
    ORDER BY move_time ASC
    LIMIT 1
    `,
    [profile.id]
  );

  const booking = todayResult.rows[0];

  return {
    stats: {
      new_requests: statsResult.rows[0].new_requests,
      new_bookings_this_week: statsResult.rows[0].new_bookings_this_week,
      completed_trips: statsResult.rows[0].completed_trips,
      average_rating: Number(ratingResult.rows[0].average_rating || 0),
      rating_count: ratingResult.rows[0].rating_count,
      earnings_this_month: Number(earningsResult.rows[0].earnings_this_month || 0)
    },
    today_booking: booking
      ? {
          id: booking.id,
          moving_type: booking.inventory_size || "Residential move",
          pickup_address: booking.pickup_address,
          delivery_address: booking.delivery_address,
          move_time: booking.move_time,
          status: booking.status
        }
      : null
  };
}

async function emitMoverDashboardUpdate(moverUserId) {
  try {
    const dashboard = await getMoverDashboard(moverUserId);
    emitToUser(moverUserId, "mover_dashboard_updated", dashboard);
  } catch (_) {}
}

async function getMoverBookings(moverUserId, status) {
  const values = [moverUserId];
  let statusFilter = "";

  if (status) {
    values.push(status);
    statusFilter = `AND mb.status = $${values.length}`;
  }

  const result = await pool.query(
    `
    SELECT
      mb.*,
      mp.company_name,
      hf.full_name AS homefinder_name,
      hf.phone_number AS homefinder_phone,
      hf.profile_image_url AS homefinder_profile_image_url
    FROM mover_bookings mb
    JOIN mover_profiles mp ON mp.id = mb.mover_profile_id
    JOIN users hf ON hf.user_id = mb.homefinder_user_id
    WHERE mb.mover_user_id = $1
      ${statusFilter}
    ORDER BY mb.created_at DESC
    `,
    values
  );

  return result.rows;
}

async function getHomefinderBookings(homefinderUserId, status) {
  const values = [homefinderUserId];
  let statusFilter = "";

  if (status) {
    values.push(status);
    statusFilter = `AND mb.status = $${values.length}`;
  }

  const result = await pool.query(
    `
    SELECT
      mb.*,
      mp.company_name,
      mp.business_logo_url
    FROM mover_bookings mb
    JOIN mover_profiles mp ON mp.id = mb.mover_profile_id
    WHERE mb.homefinder_user_id = $1
      ${statusFilter}
    ORDER BY mb.created_at DESC
    `,
    values
  );

  return result.rows;
}

async function updateMoverBookingStatus({
  bookingId,
  moverUserId,
  status,
  note = null,
  cancellationReason = null
}) {
  const booking = await getBookingById(bookingId);

  if (!booking) {
    throw new Error("Booking not found");
  }

  if (booking.mover_user_id !== moverUserId) {
    throw new Error("You do not have permission to update this booking");
  }

  const result = await pool.query(
    `
    UPDATE mover_bookings
    SET status = $2::varchar(40),
        mover_response_note = COALESCE($3, mover_response_note),
        cancellation_reason = COALESCE($4, cancellation_reason),
        final_price = CASE
          WHEN $5 = true THEN COALESCE(final_price, estimated_price)
          ELSE final_price
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
    `,
    [
      bookingId,
      status,
      note,
      cancellationReason,
      status === "completed"
    ]
  );

  const updated = result.rows[0];

  if (status === "completed") {
    await createEarningForCompletedBooking(updated);
  }

  const fullBooking = await getBookingById(bookingId);

  emitToUser(fullBooking.homefinder_user_id, "mover_booking_status_updated", {
    booking: fullBooking
  });
  emitToUser(fullBooking.mover_user_id, "mover_booking_status_updated", {
    booking: fullBooking
  });
  await emitMoverDashboardUpdate(fullBooking.mover_user_id);

  return fullBooking;
}

async function createEarningForCompletedBooking(booking) {
  const grossAmount = toNumber(booking.final_price || booking.estimated_price);
  const platformFee = Number((grossAmount * PLATFORM_FEE_RATE).toFixed(2));
  const netAmount = Number((grossAmount - platformFee).toFixed(2));

  await pool.query(
    `
    INSERT INTO mover_earnings (
      booking_id,
      mover_profile_id,
      mover_user_id,
      gross_amount,
      platform_fee,
      net_amount,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'pending')
    ON CONFLICT (booking_id)
    DO UPDATE SET
      gross_amount = EXCLUDED.gross_amount,
      platform_fee = EXCLUDED.platform_fee,
      net_amount = EXCLUDED.net_amount,
      updated_at = CURRENT_TIMESTAMP
    `,
    [
      booking.id,
      booking.mover_profile_id,
      booking.mover_user_id,
      grossAmount,
      platformFee,
      netAmount
    ]
  );
}

async function cancelHomefinderBooking(bookingId, homefinderUserId, reason = null) {
  const booking = await getBookingById(bookingId);

  if (!booking) {
    throw new Error("Booking not found");
  }

  if (booking.homefinder_user_id !== homefinderUserId) {
    throw new Error("You do not have permission to cancel this booking");
  }

  if (booking.status === "completed") {
    throw new Error("Completed bookings cannot be cancelled");
  }

  const result = await pool.query(
    `
    UPDATE mover_bookings
    SET status = 'cancelled_by_homefinder',
        cancellation_reason = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING *
    `,
    [reason, bookingId]
  );

  const updated = await getBookingById(result.rows[0].id);

  emitToUser(updated.mover_user_id, "mover_booking_status_updated", {
    booking: updated
  });
  emitToUser(updated.homefinder_user_id, "mover_booking_status_updated", {
    booking: updated
  });
  await emitMoverDashboardUpdate(updated.mover_user_id);

  return updated;
}

async function createMoverReview(homefinderUserId, bookingId, data) {
  const booking = await getBookingById(bookingId);

  if (!booking) {
    throw new Error("Booking not found");
  }

  if (booking.homefinder_user_id !== homefinderUserId) {
    throw new Error("You do not have permission to review this booking");
  }

  if (booking.status !== "completed") {
    throw new Error("Only completed bookings can be reviewed");
  }

  const rating = toNumber(data.rating);

  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  const result = await pool.query(
    `
    INSERT INTO mover_reviews (
      booking_id,
      homefinder_user_id,
      mover_profile_id,
      mover_user_id,
      rating,
      comment
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (booking_id)
    DO UPDATE SET
      rating = EXCLUDED.rating,
      comment = EXCLUDED.comment,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
    `,
    [
      bookingId,
      homefinderUserId,
      booking.mover_profile_id,
      booking.mover_user_id,
      rating,
      data.comment || null
    ]
  );

  const avgResult = await pool.query(
    `
    SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS average_rating
    FROM mover_reviews
    WHERE mover_user_id = $1
    `,
    [booking.mover_user_id]
  );

  await pool.query(
    `
    UPDATE users
    SET rating = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $2
    `,
    [avgResult.rows[0].average_rating, booking.mover_user_id]
  );

  emitToUser(booking.mover_user_id, "mover_review_created", {
    review: result.rows[0]
  });
  await emitMoverDashboardUpdate(booking.mover_user_id);

  return result.rows[0];
}

module.exports = {
  getVerifiedMovers,
  getVerifiedMoverById,
  createMoverBooking,
  getMoverDashboard,
  getMoverBookings,
  getHomefinderBookings,
  getBookingById,
  updateMoverBookingStatus,
  cancelHomefinderBooking,
  createMoverReview
};