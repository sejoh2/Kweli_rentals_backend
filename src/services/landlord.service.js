// const pool = require("../config/db");

// async function createOrUpdateLandlord(landlordData, profileImageUrl) {
//   const { uid, full_name, email, phone_number, location } = landlordData;

//   const result = await pool.query(
//     `
//     INSERT INTO landlords (
//       uid,
//       full_name,
//       email,
//       phone_number,
//       location,
//       profile_image_url,
//       updated_at
//     )
//     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
//     ON CONFLICT (uid) 
//     DO UPDATE SET
//       full_name = EXCLUDED.full_name,
//       email = EXCLUDED.email,
//       phone_number = EXCLUDED.phone_number,
//       location = EXCLUDED.location,
//       profile_image_url = COALESCE(EXCLUDED.profile_image_url, landlords.profile_image_url),
//       updated_at = CURRENT_TIMESTAMP
//     RETURNING *
//     `,
//     [uid, full_name, email, phone_number, location, profileImageUrl]
//   );

//   return result.rows[0];
// }

// async function getLandlordByUid(uid) {
//   const result = await pool.query(
//     `
//     SELECT * FROM landlords WHERE uid = $1
//     `,
//     [uid]
//   );

//   return result.rows[0];
// }

// async function getLandlordById(id) {
//   const result = await pool.query(
//     `
//     SELECT * FROM landlords WHERE id = $1
//     `,
//     [id]
//   );

//   return result.rows[0];
// }

// async function updateLandlord(uid, updates) {
//   const setClause = Object.keys(updates)
//     .map((key, index) => `${key} = $${index + 2}`)
//     .join(', ');
  
//   const values = [uid, ...Object.values(updates)];

//   const result = await pool.query(
//     `
//     UPDATE landlords 
//     SET ${setClause}, updated_at = CURRENT_TIMESTAMP
//     WHERE uid = $1
//     RETURNING *
//     `,
//     values
//   );

//   return result.rows[0];
// }

// async function updateLandlordStats(uid, totalListings) {
//   const result = await pool.query(
//     `
//     UPDATE landlords 
//     SET total_listings = $2,
//         updated_at = CURRENT_TIMESTAMP
//     WHERE uid = $1
//     RETURNING *
//     `,
//     [uid, totalListings]
//   );

//   return result.rows[0];
// }

// module.exports = {
//   createOrUpdateLandlord,
//   getLandlordByUid,
//   getLandlordById,
//   updateLandlord,

//   updateLandlordStats
// };