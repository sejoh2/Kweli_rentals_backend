const { supabaseAdmin } = require("../config/supabase");
const fs = require("fs");

// Upload verification document using ADMIN client (bypasses RLS)
const uploadVerificationDocument = async (file, userId, documentType) => {
  const fileExt = file.originalname.split(".").pop();
  const timestamp = Date.now();
  const fileName = `verification/${userId}/${documentType}_${timestamp}.${fileExt}`;
  const storagePath = fileName;

  // Use supabaseAdmin to bypass RLS
  const { data, error } = await supabaseAdmin.storage
    .from("verification-documents")
    .upload(storagePath, fs.readFileSync(file.path), {
      contentType: file.mimetype,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw error;

  // Get public URL
  const { data: publicUrlData } = supabaseAdmin.storage
    .from("verification-documents")
    .getPublicUrl(storagePath);

  return {
    fileUrl: publicUrlData.publicUrl,
    storagePath: storagePath,
    fileName: fileName,
    fileSize: file.size,
    mimeType: file.mimetype,
  };
};

// Get all documents for a user (use regular client for reads - works with anon key)
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

// Save document metadata to database
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

// Delete all documents for a user (use admin client)
const deleteAllUserDocuments = async (userId, pool) => {
  // Get all storage paths
  const docsResult = await pool.query(
    `SELECT storage_path FROM verification_documents WHERE user_id = $1`,
    [userId]
  );
  
  // Delete from Supabase Storage using admin client
  for (const doc of docsResult.rows) {
    await supabaseAdmin.storage
      .from("verification-documents")
      .remove([doc.storage_path]);
  }
  
  // Delete from database
  await pool.query(`DELETE FROM verification_documents WHERE user_id = $1`, [userId]);
  
  return { success: true };
};

// Refresh signed URL for a document
const refreshSignedUrl = async (storagePath, expiresIn = 900) => {
  const { data: signedUrlData, error } = await supabaseAdmin.storage
    .from("verification-documents")
    .createSignedUrl(storagePath, expiresIn);
  
  if (error) throw error;
  return signedUrlData.signedUrl;
};

module.exports = {
  uploadVerificationDocument,
  getUserDocuments,
  saveDocumentMetadata,
  deleteAllUserDocuments,
  refreshSignedUrl,
};