const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const pool = require("../config/db");
const { supabaseAdmin } = require("../config/supabase");

const MOVER_DOCUMENTS_BUCKET =
  process.env.MOVER_DOCUMENTS_BUCKET || "verification-documents";

const MOVER_LOGOS_BUCKET =
  process.env.MOVER_LOGOS_BUCKET || "property-media";

const jsonValue = (value, fallback) => JSON.stringify(value ?? fallback);

const toNullableNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

async function uploadFileToSupabase(file, folder, bucketName = MOVER_DOCUMENTS_BUCKET) {
  const extension = path.extname(file.originalname || "");
  const storagePath = `movers/${folder}/${Date.now()}-${crypto.randomUUID()}${extension}`;
  const fileBuffer = await fs.readFile(file.path);

  try {
    const { error } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(storagePath, fileBuffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (error) throw error;

    const { data } = supabaseAdmin.storage
      .from(bucketName)
      .getPublicUrl(storagePath);

    return {
      file_name: file.originalname,
      file_url: data.publicUrl,
      file_size: file.size,
      mime_type: file.mimetype,
      storage_path: storagePath
    };
  } finally {
    await fs.unlink(file.path).catch(() => {});
  }
}

async function saveMoverDocument(profileId, documentType, uploadResult, client = pool) {
  const result = await client.query(
    `
    INSERT INTO mover_documents (
      mover_profile_id,
      document_type,
      file_name,
      file_url,
      file_size,
      mime_type,
      storage_path,
      uploaded_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (mover_profile_id, document_type)
    DO UPDATE SET
      file_name = EXCLUDED.file_name,
      file_url = EXCLUDED.file_url,
      file_size = EXCLUDED.file_size,
      mime_type = EXCLUDED.mime_type,
      storage_path = EXCLUDED.storage_path,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
    `,
    [
      profileId,
      documentType,
      uploadResult.file_name,
      uploadResult.file_url,
      uploadResult.file_size,
      uploadResult.mime_type,
      uploadResult.storage_path
    ]
  );

  return result.rows[0];
}

async function getMoverProfileByUserId(userId) {
  const result = await pool.query(
    `
    SELECT
      mp.*,
      jsonb_build_object(
        'id', u.id,
        'user_id', u.user_id,
        'full_name', u.full_name,
        'email', u.email,
        'phone_number', u.phone_number,
        'profile_image_url', u.profile_image_url,
        'role', u.role,
        'is_verified', u.is_verified,
        'verification_status', u.verification_status,
        'was_rejected', u.was_rejected,
        'rejection_reason', u.rejection_reason
      ) AS user,
      COALESCE(d.documents, '[]'::jsonb) AS documents
    FROM mover_profiles mp
    JOIN users u ON u.user_id = mp.owner_user_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', md.id,
          'document_type', md.document_type,
          'file_name', md.file_name,
          'file_url', md.file_url,
          'file_size', md.file_size,
          'mime_type', md.mime_type,
          'storage_path', md.storage_path,
          'uploaded_at', md.uploaded_at
        )
      ) AS documents
      FROM mover_documents md
      WHERE md.mover_profile_id = mp.id
    ) d ON true
    WHERE mp.owner_user_id = $1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function getMoverProfileById(profileId) {
  const result = await pool.query(
    `
    SELECT
      mp.*,
      jsonb_build_object(
        'id', u.id,
        'user_id', u.user_id,
        'full_name', u.full_name,
        'email', u.email,
        'phone_number', u.phone_number,
        'profile_image_url', u.profile_image_url,
        'role', u.role,
        'is_verified', u.is_verified,
        'verification_status', u.verification_status,
        'was_rejected', u.was_rejected,
        'rejection_reason', u.rejection_reason
      ) AS user,
      COALESCE(d.documents, '[]'::jsonb) AS documents
    FROM mover_profiles mp
    JOIN users u ON u.user_id = mp.owner_user_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', md.id,
          'document_type', md.document_type,
          'file_name', md.file_name,
          'file_url', md.file_url,
          'file_size', md.file_size,
          'mime_type', md.mime_type,
          'storage_path', md.storage_path,
          'uploaded_at', md.uploaded_at
        )
      ) AS documents
      FROM mover_documents md
      WHERE md.mover_profile_id = mp.id
    ) d ON true
    WHERE mp.id = $1
    `,
    [profileId]
  );

  return result.rows[0] || null;
}

async function registerMover(userId, data, files = {}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const profileResult = await client.query(
      `
      INSERT INTO mover_profiles (
        owner_user_id,
        company_name,
        license_number,
        years_in_operation,
        business_address,
        business_phone,
        business_email,
        website,
        base_location,
        service_areas,
        moving_types,
        fleet_details,
        base_fee,
        rate_per_km,
        hourly_rate,
        notice_period_days,
        working_hours,
        registration_status,
        rejection_reason,
        admin_notes,
        verified_by,
        verified_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10::jsonb, $11::jsonb, $12::jsonb,
        $13, $14, $15, $16, $17::jsonb,
        'pending_verification', NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP
      )
      ON CONFLICT (owner_user_id)
      DO UPDATE SET
        company_name = EXCLUDED.company_name,
        license_number = EXCLUDED.license_number,
        years_in_operation = EXCLUDED.years_in_operation,
        business_address = EXCLUDED.business_address,
        business_phone = EXCLUDED.business_phone,
        business_email = EXCLUDED.business_email,
        website = EXCLUDED.website,
        base_location = EXCLUDED.base_location,
        service_areas = EXCLUDED.service_areas,
        moving_types = EXCLUDED.moving_types,
        fleet_details = EXCLUDED.fleet_details,
        base_fee = EXCLUDED.base_fee,
        rate_per_km = EXCLUDED.rate_per_km,
        hourly_rate = EXCLUDED.hourly_rate,
        notice_period_days = EXCLUDED.notice_period_days,
        working_hours = EXCLUDED.working_hours,
        registration_status = 'pending_verification',
        rejection_reason = NULL,
        admin_notes = NULL,
        verified_by = NULL,
        verified_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [
        userId,
        data.company_name,
        data.license_number || null,
        toNullableNumber(data.years_in_operation),
        data.business_address || null,
        data.business_phone || null,
        data.business_email || null,
        data.website || null,
        data.base_location || null,
        jsonValue(data.service_areas, []),
        jsonValue(data.moving_types, []),
        jsonValue(data.fleet_details, []),
        toNullableNumber(data.base_fee),
        toNullableNumber(data.rate_per_km),
        toNullableNumber(data.hourly_rate),
        toNullableNumber(data.notice_period_days),
        jsonValue(data.working_hours, {})
      ]
    );

    const profile = profileResult.rows[0];

    if (files.business_logo?.[0]) {
      const uploadResult = await uploadFileToSupabase(
        files.business_logo[0],
        "business-logos",
        MOVER_LOGOS_BUCKET
      );

      await client.query(
        `
        UPDATE mover_profiles
        SET business_logo_url = $1,
            business_logo_storage_path = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        `,
        [uploadResult.file_url, uploadResult.storage_path, profile.id]
      );
    }

    if (files.insurance_policy?.[0]) {
      const uploadResult = await uploadFileToSupabase(
        files.insurance_policy[0],
        "insurance-policies",
        MOVER_DOCUMENTS_BUCKET
      );

      await saveMoverDocument(profile.id, "insurance_policy", uploadResult, client);
    }

    if (files.owner_id_document?.[0]) {
      const uploadResult = await uploadFileToSupabase(
        files.owner_id_document[0],
        "owner-id-documents",
        MOVER_DOCUMENTS_BUCKET
      );

      await saveMoverDocument(profile.id, "owner_id_document", uploadResult, client);
    }

    await client.query(
      `
      UPDATE users
      SET verification_status = 'in_progress',
          is_verified = false,
          documents_submitted = true,
          was_rejected = false,
          rejection_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      `,
      [userId]
    );

    await client.query("COMMIT");

    return getMoverProfileByUserId(userId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateMoverProfile(userId, updates) {
  const allowedFields = {
    company_name: "text",
    license_number: "text",
    years_in_operation: "number",
    business_address: "text",
    business_phone: "text",
    business_email: "text",
    website: "text",
    base_location: "text",
    service_areas: "json",
    moving_types: "json",
    fleet_details: "json",
    base_fee: "number",
    rate_per_km: "number",
    hourly_rate: "number",
    notice_period_days: "number",
    working_hours: "json"
  };

  const fields = [];
  const values = [userId];
  let paramIndex = 2;

  Object.keys(updates).forEach((key) => {
    if (!allowedFields[key] || updates[key] === undefined) return;

    if (allowedFields[key] === "json") {
      fields.push(`${key} = $${paramIndex}::jsonb`);
      values.push(JSON.stringify(updates[key]));
    } else {
      fields.push(`${key} = $${paramIndex}`);
      values.push(
        allowedFields[key] === "number"
          ? toNullableNumber(updates[key])
          : updates[key]
      );
    }

    paramIndex++;
  });

  if (fields.length === 0) {
    throw new Error("No valid mover profile fields to update");
  }

  const result = await pool.query(
    `
    UPDATE mover_profiles
    SET ${fields.join(", ")},
        updated_at = CURRENT_TIMESTAMP
    WHERE owner_user_id = $1
    RETURNING *
    `,
    values
  );

  if (!result.rows[0]) {
    throw new Error("Mover profile not found");
  }

  return getMoverProfileByUserId(userId);
}

async function uploadMoverDocuments(userId, files = {}) {
  const profile = await getMoverProfileByUserId(userId);

  if (!profile) {
    throw new Error("Mover profile not found. Please complete registration first.");
  }

  if (files.insurance_policy?.[0]) {
    const uploadResult = await uploadFileToSupabase(
      files.insurance_policy[0],
      "insurance-policies",
      MOVER_DOCUMENTS_BUCKET
    );

    await saveMoverDocument(profile.id, "insurance_policy", uploadResult);
  }

  if (files.owner_id_document?.[0]) {
    const uploadResult = await uploadFileToSupabase(
      files.owner_id_document[0],
      "owner-id-documents",
      MOVER_DOCUMENTS_BUCKET
    );

    await saveMoverDocument(profile.id, "owner_id_document", uploadResult);
  }

  if (files.business_logo?.[0]) {
    const uploadResult = await uploadFileToSupabase(
      files.business_logo[0],
      "business-logos",
      MOVER_LOGOS_BUCKET
    );

    await pool.query(
      `
      UPDATE mover_profiles
      SET business_logo_url = $1,
          business_logo_storage_path = $2,
          registration_status = CASE
            WHEN registration_status = 'verified' THEN registration_status
            ELSE 'pending_verification'
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      `,
      [uploadResult.file_url, uploadResult.storage_path, profile.id]
    );
  }

  await pool.query(
    `
    UPDATE mover_profiles
    SET registration_status = CASE
      WHEN registration_status = 'verified' THEN registration_status
      ELSE 'pending_verification'
    END,
    updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    `,
    [profile.id]
  );

  return getMoverProfileByUserId(userId);
}

async function getPendingMoverProfiles() {
  const result = await pool.query(
    `
    SELECT
      mp.*,
      jsonb_build_object(
        'id', u.id,
        'user_id', u.user_id,
        'full_name', u.full_name,
        'email', u.email,
        'phone_number', u.phone_number,
        'profile_image_url', u.profile_image_url,
        'verification_status', u.verification_status
      ) AS user
    FROM mover_profiles mp
    JOIN users u ON u.user_id = mp.owner_user_id
    WHERE mp.registration_status = 'pending_verification'
    ORDER BY mp.updated_at ASC
    `
  );

  return result.rows;
}

async function approveMoverProfile(profileId, adminUserId, notes = null) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const profileResult = await client.query(
      `
      UPDATE mover_profiles
      SET registration_status = 'verified',
          rejection_reason = NULL,
          admin_notes = $1,
          verified_by = $2,
          verified_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
      `,
      [notes, adminUserId, profileId]
    );

    const profile = profileResult.rows[0];

    if (!profile) {
      throw new Error("Mover profile not found");
    }

    await client.query(
      `
      UPDATE users
      SET verification_status = 'verified',
          is_verified = true,
          was_rejected = false,
          rejection_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      `,
      [profile.owner_user_id]
    );

    await client.query("COMMIT");

    return getMoverProfileById(profileId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function rejectMoverProfile(profileId, reason, adminUserId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const profileResult = await client.query(
      `
      UPDATE mover_profiles
      SET registration_status = 'rejected',
          rejection_reason = $1,
          verified_by = $2,
          verified_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
      `,
      [reason || "No reason provided", adminUserId, profileId]
    );

    const profile = profileResult.rows[0];

    if (!profile) {
      throw new Error("Mover profile not found");
    }

    await client.query(
      `
      UPDATE users
      SET verification_status = 'not_verified',
          is_verified = false,
          was_rejected = true,
          rejection_reason = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
      `,
      [reason || "No reason provided", profile.owner_user_id]
    );

    await client.query("COMMIT");

    return getMoverProfileById(profileId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getMoverProfileByUserId,
  getMoverProfileById,
  registerMover,
  updateMoverProfile,
  uploadMoverDocuments,
  getPendingMoverProfiles,
  approveMoverProfile,
  rejectMoverProfile
};