const { supabase } = require("../config/supabase");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");

async function uploadMedia(file) {
  console.log("Uploading file:", file.originalname);
  console.log("File path:", file.path);
  
  const fileExt = file.originalname.split(".").pop();
  const fileName = `${uuidv4()}.${fileExt}`;

  try {
    const fileBuffer = fs.readFileSync(file.path);
    console.log("File size:", fileBuffer.length);
    
    const { data, error } = await supabase.storage
      .from("property-media")
      .upload(fileName, fileBuffer, {
        contentType: file.mimetype,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Supabase upload error:", error);
      throw error;
    }

    console.log("Upload successful:", data);

    const { data: publicUrl } = supabase.storage
      .from("property-media")
      .getPublicUrl(fileName);

    console.log("Public URL:", publicUrl.publicUrl);
    
    return publicUrl.publicUrl;
  } catch (error) {
    console.error("Upload error:", error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}

module.exports = { uploadMedia };