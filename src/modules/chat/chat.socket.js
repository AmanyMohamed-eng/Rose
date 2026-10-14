const { Server } = require("socket.io");
const mongoose = require("mongoose");

const Conversation = require("../../models/Conversation");
const Message = require("../../models/Message");
const User = require("../../models/User");
const presence = require("./chat.service");
const AppError = require("../../utils/AppError");
const { verifyToken } = require("../../utils/jwt");
const { config } = require("../../config/env");

const SIDES = ["CUSTOMER", "FLORIST", "ADMIN"];
const MAX_BODY_LENGTH = 2000;
const MAX_ATTACHMENTS = 5;
const MAX_READ_IDS = 200;
const SEND_LIMIT = { max: 20, windowMs: 10_000 };

const roleToSide = (role) => {
  if (role === "admin") return "ADMIN";
  if (role === "florist") return "FLORIST";
  if (role === "customer") return "CUSTOMER";
  throw new Error("unknown role");
};

const userRoom = (userId) => `user:${userId}`;
const convRoom = (conversationId) => `conv:${conversationId}`;

const canAccessConversation = (conv, user) => {
  if (user.role === "admin") return true;
  if (user.role === "customer" && conv.customer.toString() === user.id)
    return true;
  if (
    user.role === "florist" &&
    conv.florist &&
    conv.florist.toString() === user.id
  )
    return true;
  return false;
};

const noop = () => {};

/**
 * Wraps a socket event handler so that a malformed payload (missing/non-object argument, missing or
 * non-function ack, thrown error, rejected promise) can never crash the process. Previously, destructuring an
 * undefined payload inside the handler threw an unhandled rejection / uncaught exception, which takes the whole
 * Node process down — i.e. any logged-in user could kill the server with `socket.emit("conversation:join")`.
 */
const SESSION_RECHECK_MS = 5000;

/**
 * The handshake validates the token once, but a socket can stay connected for hours. Re-check (at most every
 * SESSION_RECHECK_MS) that the user is still active and the session has not been invalidated by logout, password
 * change, role change or a block; otherwise a revoked user could keep sending messages over an open socket.
 */
const assertSessionStillValid = async (socket) => {
  const now = Date.now();
  if (socket.data.sessionCheckedAt && now - socket.data.sessionCheckedAt < SESSION_RECHECK_MS) return;
  const fresh = await User.findById(socket.data.user.id).select("role isActive tokenVersion");
  const ok =
    fresh && fresh.isActive && fresh.tokenVersion === socket.data.tokenVersion && fresh.role === socket.data.user.role;
  if (!ok) {
    socket.disconnect(true);
    throw new AppError("Session expired, please log in again", 401);
  }
  socket.data.sessionCheckedAt = now;
};

const handle = (socket, event, fn) => {
  socket.on(event, async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : noop;
    try {
      await assertSessionStillValid(socket);
      const data = payload === undefined || payload === null ? {} : payload;
      if (typeof data !== "object" || Array.isArray(data)) {
        throw new AppError("Invalid payload", 400);
      }
      await fn(data, reply);
    } catch (err) {
      const safe = err instanceof AppError || err?.name === "ValidationError";
      if (!safe) console.error(`[chat] ${event} failed:`, err);
      reply({ ok: false, error: safe ? err.message : "Something went wrong" });
    }
  });
};

/** Sliding-window limiter, one per socket. */
const makeLimiter = ({ max, windowMs }) => {
  let hits = [];
  return () => {
    const now = Date.now();
    hits = hits.filter((t) => now - t < windowMs);
    if (hits.length >= max) return false;
    hits.push(now);
    return true;
  };
};

const loadAccessibleConversation = async (conversationId, user) => {
  if (typeof conversationId !== "string" || !mongoose.isValidObjectId(conversationId)) {
    throw new AppError("Conversation not found", 404);
  }
  const conv = await Conversation.findById(conversationId);
  if (!conv || !canAccessConversation(conv, user)) {
    throw new AppError("Conversation not found", 404);
  }
  return conv;
};

/** Only http(s) links are kept (a `javascript:` URL in an attachment is an XSS vector in the client). */
const cleanAttachments = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const a of raw.slice(0, MAX_ATTACHMENTS)) {
    if (!a || typeof a.url !== "string") continue;
    let url;
    try {
      url = new URL(a.url);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    out.push({
      url: url.toString().slice(0, 500),
      mimeType: typeof a.mimeType === "string" ? a.mimeType.slice(0, 100) : undefined,
      sizeBytes: Number.isFinite(a.sizeBytes) && a.sizeBytes >= 0 ? a.sizeBytes : undefined,
      name: typeof a.name === "string" ? a.name.slice(0, 120) : undefined,
    });
  }
  return out;
};

/**
 * Delivers an event only to the sockets in `room` whose side is in `sides`.
 *
 * This is the core of the Admin-mediator rule: a conversation room can hold the customer, the florist and the
 * admin at the same time, but every message carries `visibleTo`. Broadcasting to the whole room (as the old code
 * did) showed the customer's messages to the florist, the florist's to the customer, and admin-only notes to both.
 * `payloadFor(side)` lets each recipient get a view appropriate for their side.
 */
const emitToSides = async (io, room, sides, event, payloadFor, { exceptSocketId } = {}) => {
  const sockets = await io.in(room).fetchSockets();
  for (const s of sockets) {
    if (exceptSocketId && s.id === exceptSocketId) continue;
    const user = s.data && s.data.user;
    if (!user) continue;
    const side = roleToSide(user.role);
    if (!sides.includes(side)) continue;
    s.emit(event, typeof payloadFor === "function" ? payloadFor(side) : payloadFor);
  }
};

const initChatSocket = (httpServer, { corsOrigins } = {}) => {
  const io = new Server(httpServer, {
    // Never fall back to "*" with credentials: default to the same allow-list the REST API uses.
    cors: { origin: corsOrigins ?? config.clientOrigins, credentials: true },
    path: "/socket.io",
  });

  // Same checks as the REST `authenticate` middleware: pinned algorithm AND a database lookup, so that
  // deactivated users, logged-out sessions (tokenVersion) and role changes take effect immediately.
  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
      const token = typeof raw === "string" ? raw.replace(/^Bearer\s+/i, "").trim() : "";
      if (!token) return next(new Error("Missing token"));

      let payload;
      try {
        payload = verifyToken(token);
      } catch {
        return next(new Error("Invalid token"));
      }
      if (!mongoose.isValidObjectId(payload.id)) return next(new Error("Invalid token"));

      const user = await User.findById(payload.id).select("name role isActive tokenVersion");
      if (!user || !user.isActive || (payload.tv || 0) !== user.tokenVersion) {
        return next(new Error("Invalid token"));
      }

      // `socket.data` (not a custom property) so the identity is also visible through io.fetchSockets().
      socket.data.user = { id: user.id, role: user.role, name: user.name };
      socket.data.tokenVersion = user.tokenVersion;
      socket.data.sessionCheckedAt = Date.now();
      return next();
    } catch (err) {
      console.error("[chat] socket auth failed:", err.message);
      return next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    const { id: userId, role } = user;
    const side = roleToSide(role);
    const canSend = makeLimiter(SEND_LIMIT);

    socket.join(userRoom(userId));
    if (role === "admin") socket.join("role:admin");

    const becameOnline = presence.addSocket(userId, socket.id);
    if (becameOnline) {
      io.to("role:admin").emit("presence:update", { userId, online: true });
    }

    handle(socket, "conversation:join", async ({ conversationId }, ack) => {
      const conv = await loadAccessibleConversation(conversationId, user);
      socket.join(convRoom(conv.id));

      const messages = await Message.find({
        conversation: conv._id,
        visibleTo: side,
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate("author", "name role");

      // toView() keeps relay metadata (relayedBy, originalBody, ...) away from non-admin sides.
      ack({ ok: true, messages: messages.reverse().map((m) => m.toView(side)) });
    });

    handle(socket, "conversation:leave", async ({ conversationId }) => {
      if (typeof conversationId !== "string") return;
      socket.leave(convRoom(conversationId));
      presence.clearTyping(conversationId, userId);
    });

    handle(socket, "message:send", async ({ conversationId, body, attachments, visibleTo }, ack) => {
      if (!canSend()) throw new AppError("You are sending messages too fast", 429);
      if (typeof body !== "string" || !body.trim()) throw new AppError("Empty message", 400);
      const text = body.trim();
      if (text.length > MAX_BODY_LENGTH) {
        throw new AppError(`Message too long (max ${MAX_BODY_LENGTH})`, 400);
      }

      const conv = await loadAccessibleConversation(conversationId, user);
      if (conv.status === "CLOSED") throw new AppError("This conversation is closed", 409);

      let resolvedVisibility;
      if (side === "ADMIN") {
        // The admin decides who sees a message (that is what "mediator" means); default is admin-only.
        const requested = Array.isArray(visibleTo) ? visibleTo.filter((s) => SIDES.includes(s)) : [];
        resolvedVisibility = [...new Set([...(requested.length ? requested : ["ADMIN"]), "ADMIN"])];
      } else {
        resolvedVisibility = [side, "ADMIN"];
      }

      const message = await Message.create({
        conversation: conv._id,
        author: userId,
        authorSide: side,
        body: text,
        attachments: cleanAttachments(attachments),
        visibleTo: resolvedVisibility,
      });

      // Keeps lastMessageAt / preview / messageCount AND the per-side unread counters in sync.
      conv.applyNewMessage(message);
      await conv.save();

      await message.populate("author", "name role");

      await emitToSides(io, convRoom(conv.id), message.visibleTo, "message:new", (recipientSide) =>
        message.toView(recipientSide)
      );

      presence.clearTyping(conv.id, userId);

      ack({ ok: true, messageId: message._id });
    });

    const onTyping = (typing) => async ({ conversationId }) => {
      // Only for rooms this socket actually joined (i.e. passed the access check).
      if (typeof conversationId !== "string" || !socket.rooms.has(convRoom(conversationId))) return;

      if (typing) presence.setTyping(conversationId, userId);
      else presence.clearTyping(conversationId, userId);

      // A customer's/florist's typing indicator goes to the admin only; the admin's goes to everyone.
      // (Otherwise customer and florist could see each other typing — a direct channel between them.)
      const audience = side === "ADMIN" ? SIDES : ["ADMIN"];
      await emitToSides(
        io,
        convRoom(conversationId),
        audience,
        "typing:update",
        (recipientSide) => ({
          conversationId,
          side,
          typing,
          ...(recipientSide === "ADMIN" ? { userId } : {}),
        }),
        { exceptSocketId: socket.id }
      );
    };
    handle(socket, "typing:start", onTyping(true));
    handle(socket, "typing:stop", onTyping(false));

    handle(socket, "message:read", async ({ conversationId, messageIds }, ack) => {
      const conv = await loadAccessibleConversation(conversationId, user);

      const ids = (Array.isArray(messageIds) ? messageIds : [])
        .filter((id) => typeof id === "string" && mongoose.isValidObjectId(id))
        .slice(0, MAX_READ_IDS);
      if (!ids.length) return ack({ ok: true, updated: 0 });

      const unreadFilter = {
        conversation: conv._id,
        visibleTo: side,
        authorSide: { $ne: side },
        "readBy.side": { $ne: side },
      };

      const targets = await Message.find({ ...unreadFilter, _id: { $in: ids } }).select("authorSide");
      if (!targets.length) return ack({ ok: true, updated: 0 });

      const result = await Message.updateMany(
        { ...unreadFilter, _id: { $in: targets.map((m) => m._id) } },
        { $push: { readBy: { user: userId, side, readAt: new Date() } } }
      );

      // Recompute (rather than zero) the counter: only SOME messages may have been marked read.
      const remaining = await Message.countDocuments(unreadFilter);
      await Conversation.updateOne({ _id: conv._id }, { $set: { [`unreadCounts.${side}`]: remaining } });

      // Read receipts go to the admin and to the sides that authored the messages — never to a third party.
      const audience = [...new Set(["ADMIN", ...targets.map((m) => m.authorSide)])];
      await emitToSides(
        io,
        convRoom(conv.id),
        audience,
        "message:read",
        (recipientSide) => ({
          conversationId: conv.id,
          readerSide: side,
          messageIds: targets.map((m) => String(m._id)),
          ...(recipientSide === "ADMIN" ? { readerId: userId } : {}),
        }),
        { exceptSocketId: socket.id }
      );

      return ack({ ok: true, updated: result.modifiedCount });
    });

    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (room.startsWith("conv:")) presence.clearTyping(room.slice(5), userId);
      }
    });

    socket.on("disconnect", () => {
      const becameOffline = presence.removeSocket(userId, socket.id);
      if (becameOffline) {
        io.to("role:admin").emit("presence:update", { userId, online: false });
      }
    });
  });

  return io;
};

module.exports = {
  assertSessionStillValid,
  initChatSocket,
  canAccessConversation,
  roleToSide,
  userRoom,
  convRoom,
};
