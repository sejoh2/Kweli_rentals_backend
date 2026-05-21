const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

function hasValidCoordinates(latitude, longitude) {
  return (
    latitude !== null &&
    longitude !== null &&
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude)
  );
}

function looksLikeCoordinates(value) {
  if (!value) return false;
  return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(value.trim());
}

async function callGoogleGeocoding(params) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const searchParams = new URLSearchParams({
    ...params,
    key: GOOGLE_MAPS_API_KEY,
  });

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?${searchParams.toString()}`
  );

  if (!response.ok) return null;

  const data = await response.json();

  if (data.status !== "OK" || !data.results || data.results.length === 0) {
    return null;
  }

  return data.results[0];
}

async function reverseGeocode(latitude, longitude) {
  if (!hasValidCoordinates(latitude, longitude)) return null;

  try {
    const result = await callGoogleGeocoding({
      latlng: `${latitude},${longitude}`,
    });

    if (!result) return null;

    return {
      locationText: result.formatted_address,
      latitude,
      longitude,
      placeId: result.place_id,
    };
  } catch (error) {
    console.error("Reverse geocoding failed:", error.message);
    return null;
  }
}

async function geocodeAddress(address) {
  if (!address || !address.trim()) return null;

  try {
    const result = await callGoogleGeocoding({
      address: address.trim(),
    });

    if (!result || !result.geometry || !result.geometry.location) return null;

    return {
      locationText: result.formatted_address || address.trim(),
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      placeId: result.place_id,
    };
  } catch (error) {
    console.error("Address geocoding failed:", error.message);
    return null;
  }
}

async function resolvePropertyLocation({ locationText, latitude, longitude }) {
  let resolvedLocationText = locationText?.toString().trim() || "";
  let resolvedLatitude = latitude;
  let resolvedLongitude = longitude;

  if (
    hasValidCoordinates(resolvedLatitude, resolvedLongitude) &&
    (!resolvedLocationText || looksLikeCoordinates(resolvedLocationText))
  ) {
    const reverseResult = await reverseGeocode(
      resolvedLatitude,
      resolvedLongitude
    );

    if (reverseResult?.locationText) {
      resolvedLocationText = reverseResult.locationText;
    }
  }

  if (
    resolvedLocationText &&
    !hasValidCoordinates(resolvedLatitude, resolvedLongitude)
  ) {
    const geocodeResult = await geocodeAddress(resolvedLocationText);

    if (geocodeResult) {
      resolvedLocationText = geocodeResult.locationText || resolvedLocationText;
      resolvedLatitude = geocodeResult.latitude;
      resolvedLongitude = geocodeResult.longitude;
    }
  }

  return {
    locationText: resolvedLocationText,
    latitude: hasValidCoordinates(resolvedLatitude, resolvedLongitude)
      ? resolvedLatitude
      : null,
    longitude: hasValidCoordinates(resolvedLatitude, resolvedLongitude)
      ? resolvedLongitude
      : null,
  };
}

module.exports = {
  reverseGeocode,
  geocodeAddress,
  resolvePropertyLocation,
};