const pool = require("../config/db");
const { getMessaging } = require("../config/firebase");

const MAX_MULTICAST_TOKENS = 500;

const stringifyData = (data = {}) => {
  const normalized = {};

  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    normalized[key] = String(value);
  });

  return normalized;
};

const truncate = (text = "", max = 120) => {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.substring(0, max - 3)}...`;
};

const getUserById = async (userId) => {
  const result = await pool.query(
    `
    SELECT user_id, full_name, role
    FROM users
    WHERE user_id = $1
    `,
    [userId]
  );

  return result.rows[0] || null;
};

const getActiveTokensForUser = async (userId) => {
  const result = await pool.query(
    `
    SELECT token
    FROM notification_tokens
    WHERE user_id = $1
      AND is_active = true
    ORDER BY last_used_at DESC
    `,
    [userId]
  );

  return result.rows.map((row) => row.token).filter(Boolean);
};

const deactivateTokens = async (tokens = []) => {
  if (!tokens.length) return;

  await pool.query(
    `
    UPDATE notification_tokens
    SET is_active = false,
        updated_at = CURRENT_TIMESTAMP
    WHERE token = ANY($1)
    `,
    [tokens]
  );
};

const saveDeviceToken = async ({
  userId,
  token,
  platform = "android",
  deviceId = null
}) => {
  if (!userId || !token) {
    throw new Error("User ID and token are required");
  }

  const result = await pool.query(
    `
    INSERT INTO notification_tokens (
      user_id,
      token,
      platform,
      device_id,
      is_active,
      last_used_at
    )
    VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP)
    ON CONFLICT (token)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      platform = EXCLUDED.platform,
      device_id = EXCLUDED.device_id,
      is_active = true,
      last_used_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
    `,
    [userId, token, platform, deviceId]
  );

  return result.rows[0];
};

const removeDeviceToken = async ({ userId, token }) => {
  if (!userId || !token) {
    throw new Error("User ID and token are required");
  }

  await pool.query(
    `
    UPDATE notification_tokens
    SET is_active = false,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
      AND token = $2
    `,
    [userId, token]
  );

  return true;
};

const sendToTokens = async ({
  tokens,
  title,
  body,
  data = {},
  sound = "default"
}) => {
  const messaging = getMessaging();

  if (!messaging) {
    return {
      success: false,
      skipped: true,
      reason: "Firebase Admin is not configured"
    };
  }

  if (!tokens || tokens.length === 0) {
    return {
      success: true,
      sent: 0,
      failed: 0
    };
  }

  let sent = 0;
  let failed = 0;
  const invalidTokens = [];

  for (let i = 0; i < tokens.length; i += MAX_MULTICAST_TOKENS) {
    const chunk = tokens.slice(i, i + MAX_MULTICAST_TOKENS);

    const response = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title,
        body
      },
      data: stringifyData(data),
      android: {
        priority: "high",
        notification: {
          sound,
          channelId: data.channel_id || "kweli_rentals_default"
        }
      },
      apns: {
        payload: {
          aps: {
            sound
          }
        }
      }
    });

    sent += response.successCount;
    failed += response.failureCount;

    response.responses.forEach((item, index) => {
      if (!item.success) {
        const code = item.error?.code || "";

        if (
          code.includes("registration-token-not-registered") ||
          code.includes("invalid-registration-token") ||
          code.includes("invalid-argument")
        ) {
          invalidTokens.push(chunk[index]);
        }

        console.error("FCM send error:", item.error?.message || item.error);
      }
    });
  }

  if (invalidTokens.length > 0) {
    await deactivateTokens(invalidTokens);
  }

  return {
    success: true,
    sent,
    failed,
    invalidTokens: invalidTokens.length
  };
};

const sendToUser = async ({
  userId,
  title,
  body,
  data = {},
  sound = "default"
}) => {
  const tokens = await getActiveTokensForUser(userId);

  return sendToTokens({
    tokens,
    title,
    body,
    data: {
      ...data,
      recipient_id: userId
    },
    sound
  });
};

const sendChatMessageNotification = async (message) => {
  if (!message || !message.receiver_id || !message.sender_id) return;

  const sender = await getUserById(message.sender_id);
  const senderName = sender?.full_name || "Someone";

  return sendToUser({
    userId: message.receiver_id,
    title: `New message from ${senderName}`,
    body: truncate(message.message_text || message.text || "Sent you a message"),
    data: {
      type: "message_received",
      conversation_id: message.conversation_id,
      message_id: message.id,
      sender_id: message.sender_id,
      receiver_id: message.receiver_id,
      route: "messages"
    }
  });
};

const sendMoverBookingCreatedNotification = async (booking) => {
  if (!booking || !booking.mover_user_id) return;

  const homefinderName = booking.homefinder_name || "A homefinder";

  return sendToUser({
    userId: booking.mover_user_id,
    title: "New moving request",
    body: `${homefinderName} requested a move from ${booking.pickup_address} to ${booking.delivery_address}.`,
    data: {
      type: "mover_request_received",
      booking_id: booking.id,
      homefinder_user_id: booking.homefinder_user_id,
      mover_user_id: booking.mover_user_id,
      route: "mover_bookings"
    }
  });
};

const statusNotificationCopy = (booking) => {
  const companyName = booking.company_name || "Your mover";

  switch (booking.status) {
    case "confirmed":
      return {
        type: "mover_request_accepted",
        title: "Moving request accepted",
        body: `${companyName} accepted your moving request.`
      };
    case "declined":
      return {
        type: "mover_request_declined",
        title: "Moving request declined",
        body: `${companyName} declined your moving request.`
      };
    case "in_progress":
      return {
        type: "mover_request_in_progress",
        title: "Move started",
        body: `${companyName} has started your move.`
      };
    case "completed":
      return {
        type: "mover_request_completed",
        title: "Move completed",
        body: `${companyName} marked your move as completed.`
      };
    case "cancelled_by_homefinder":
      return {
        type: "mover_request_cancelled",
        title: "Moving request cancelled",
        body: "The homefinder cancelled this moving request."
      };
    case "cancelled_by_mover":
      return {
        type: "mover_request_cancelled",
        title: "Moving request cancelled",
        body: `${companyName} cancelled this moving request.`
      };
    default:
      return null;
  }
};

const sendMoverBookingStatusNotification = async (booking) => {
  if (!booking) return;

  const copy = statusNotificationCopy(booking);
  if (!copy) return;

  const recipientId =
    booking.status === "cancelled_by_homefinder"
      ? booking.mover_user_id
      : booking.homefinder_user_id;

  if (!recipientId) return;

  return sendToUser({
    userId: recipientId,
    title: copy.title,
    body: copy.body,
    data: {
      type: copy.type,
      booking_id: booking.id,
      status: booking.status,
      homefinder_user_id: booking.homefinder_user_id,
      mover_user_id: booking.mover_user_id,
      route:
        recipientId === booking.mover_user_id
          ? "mover_bookings"
          : "homefinder_mover_bookings"
    }
  });
};

const sendDueMoverBookingReminders = async ({
  hoursAhead = Number(process.env.BOOKING_REMINDER_HOURS || 5),
  windowMinutes = 15
} = {}) => {
  const result = await pool.query(
    `
    SELECT
      mb.*,
      mp.company_name,
      mp.business_logo_url,
      hf.full_name AS homefinder_name
    FROM mover_bookings mb
    JOIN mover_profiles mp ON mp.id = mb.mover_profile_id
    JOIN users hf ON hf.user_id = mb.homefinder_user_id
    WHERE mb.status IN ('confirmed', 'in_progress')
      AND mb.reminder_sent_at IS NULL
      AND (
        mb.move_date::timestamp + mb.move_time::time
      ) BETWEEN
        CURRENT_TIMESTAMP + ($1::int * INTERVAL '1 hour') - ($2::int * INTERVAL '1 minute')
        AND
        CURRENT_TIMESTAMP + ($1::int * INTERVAL '1 hour') + ($2::int * INTERVAL '1 minute')
    ORDER BY mb.move_date ASC, mb.move_time ASC
    LIMIT 100
    `,
    [hoursAhead, windowMinutes]
  );

  let sentCount = 0;

  for (const booking of result.rows) {
    await sendToUser({
      userId: booking.homefinder_user_id,
      title: "Moving reminder",
      body: `Your move with ${booking.company_name} is coming up in about ${hoursAhead} hours.`,
      data: {
        type: "booking_reminder",
        booking_id: booking.id,
        status: booking.status,
        route: "homefinder_mover_bookings"
      }
    });

    await sendToUser({
      userId: booking.mover_user_id,
      title: "Upcoming move reminder",
      body: `You have a move from ${booking.pickup_address} to ${booking.delivery_address} in about ${hoursAhead} hours.`,
      data: {
        type: "booking_reminder",
        booking_id: booking.id,
        status: booking.status,
        route: "mover_bookings"
      }
    });

    await pool.query(
      `
      UPDATE mover_bookings
      SET reminder_sent_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [booking.id]
    );

    sentCount += 1;
  }

  return {
    success: true,
    checked: result.rows.length,
    sent: sentCount
  };
};

module.exports = {
  saveDeviceToken,
  removeDeviceToken,
  sendToUser,
  sendChatMessageNotification,
  sendMoverBookingCreatedNotification,
  sendMoverBookingStatusNotification,
  sendDueMoverBookingReminders
};