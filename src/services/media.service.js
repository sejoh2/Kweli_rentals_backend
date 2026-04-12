const supabase = require("../config/supabase");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");

async function uploadMedia(file) {

  const fileExt = file.originalname.split(".").pop();

  const fileName = `${uuidv4()}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from("property-media")
    .upload(fileName, fs.readFileSync(file.path), {
      contentType: file.mimetype,
    });

  if (error) throw error;

  const { data: publicUrl } = supabase
    .storage
    .from("property-media")
    .getPublicUrl(fileName);

  return publicUrl.publicUrl;
}

module.exports = { uploadMedia };