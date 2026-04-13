// const multer = require("multer");
// const upload = multer({ dest: "uploads/" });
// const mediaService = require("../services/media.service");
// const userService = require("../services/user.service");

// exports.uploadMiddleware = upload.single("profileImage");

// exports.createOrUpdateLandlord = async (req, res) => {
//   try {
//     let profileImageUrl = null;

//     // Upload profile image if provided
//     if (req.file) {
//       profileImageUrl = await mediaService.uploadMedia(req.file);
//     }

//     const landlordData = {
//       uid: req.body.uid,
//       full_name: req.body.full_name,
//       email: req.body.email,
//       phone_number: req.body.phone_number,
//       location: req.body.location,
//     };

//     const landlord = await userService.createOrUpdateLandlord(landlordData, profileImageUrl);

//     res.json({
//       success: true,
//       message: "Landlord profile saved successfully",
//       landlord: landlord
//     });

//   } catch (err) {
//     console.error("Error saving landlord profile:", err);
//     res.status(500).json({
//       error: err.message
//     });
//   }
// };

// exports.getLandlord = async (req, res) => {
//   try {
//     const { uid } = req.params;
    
//     const landlord = await userService.getLandlordByUid(uid);
    
//     if (!landlord) {
//       return res.status(404).json({ error: "Landlord not found" });
//     }

//     res.json(landlord);

//   } catch (err) {
//     console.error("Error fetching landlord:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// exports.updateLandlord = async (req, res) => {
//   try {
//     const { uid } = req.params;
//     const updates = req.body;

//     const landlord = await userService.updateLandlord(uid, updates);

//     if (!landlord) {
//       return res.status(404).json({ error: "Landlord not found" });
//     }

//     res.json({
//       success: true,
//       message: "Landlord updated successfully",
//       landlord: landlord
//     });

//   } catch (err) {
//     console.error("Error updating landlord:", err);
//     res.status(500).json({ error: err.message });
//   }
// };