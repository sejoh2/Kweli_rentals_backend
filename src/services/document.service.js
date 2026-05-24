const { supabaseAdmin } = require("../config/supabase");
const fs = require("fs/promises");

const BUCKET_NAME = "verification-documents";

const uploadVerificationDocument = async (file, userId, documentType) => {
  const fileExt = file.originalname.split(".").pop();
  const timestamp = Date.now();
  const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `verification/${userId}/${documentType}_${timestamp}_${safeOriginalName}`;
  const storagePath = fileName;

  const fileBuffer = await fs.readFile(file.path);

  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(storagePath, fileBuffer, {
      contentType: file.mimetype,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw error;

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storagePath);

  return {
    fileUrl: publicUrlData.publicUrl,
    storagePath,
    fileName,
    fileSize: file.size,
    mimeType: file.mimetype,
  };
};

const deleteTempFile = async (filePath) => {
  if (!filePath) return;

  try {
    await fs.unlink(filePath);
  } catch (_) {}
};

const getUserDocuments = async (userId, pool) => {
  const result = await pool.query(
    `
    SELECT id, document_type, file_name, file_url, file_size, mime_type, storage_path, uploaded_at
    FROM verification_documents
    WHERE user_id = $1
    ORDER BY uploaded_at DESC
    `,
    [userId]
  );

  return result.rows;
};

const saveDocumentMetadata = async (userId, documentType, fileData, pool) => {
  const result = await pool.query(
    `
    INSERT INTO verification_documents (
      user_id,
      document_type,
      file_name,
      file_url,
      file_size,
      mime_type,
      storage_path,
      uploaded_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING id, document_type, file_name, file_url, uploaded_at
    `,
    [
      userId,
      documentType,
      fileData.fileName,
      fileData.fileUrl,
      fileData.fileSize,
      fileData.mimeType,
      fileData.storagePath,
    ]
  );

  return result.rows[0];
};

const deleteAllUserDocuments = async (userId, pool) => {
  const docsResult = await pool.query(
    `SELECT storage_path FROM verification_documents WHERE user_id = $1`,
    [userId]
  );

  const storagePaths = docsResult.rows
    .map((doc) => doc.storage_path)
    .filter(Boolean);

  if (storagePaths.length > 0) {
    await supabaseAdmin.storage.from(BUCKET_NAME).remove(storagePaths);
  }

  await pool.query(`DELETE FROM verification_documents WHERE user_id = $1`, [
    userId,
  ]);

  return { success: true };
};

const refreshSignedUrl = async (storagePath, expiresIn = 900) => {
  const { data: signedUrlData, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .createSignedUrl(storagePath, expiresIn);

  if (error) throw error;

  return signedUrlData.signedUrl;
};

module.exports = {
  uploadVerificationDocument,
  deleteTempFile,
  getUserDocuments,
  saveDocumentMetadata,
  deleteAllUserDocuments,
  refreshSignedUrl,
};