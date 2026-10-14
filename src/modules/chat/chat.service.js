
const onlineUsers = new Map();
const typingUsers = new Map();

const TYPING_TTL_MS = 5000;

const addSocket = (userId, socketId) => {
  const set = onlineUsers.get(userId) || new Set();
  set.add(socketId);
  onlineUsers.set(userId, set);
  return set.size === 1; 
};

const removeSocket = (userId, socketId) => {
  const set = onlineUsers.get(userId);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    onlineUsers.delete(userId);
    return true; 
  }
  return false;
};

const isOnline = (userId) => onlineUsers.has(userId);

const getOnlineUserIds = () => [...onlineUsers.keys()];

const setTyping = (conversationId, userId) => {
  const map = typingUsers.get(conversationId) || new Map();
  map.set(userId, Date.now() + TYPING_TTL_MS);
  typingUsers.set(conversationId, map);
};

const clearTyping = (conversationId, userId) => {
  const map = typingUsers.get(conversationId);
  if (!map) return;
  map.delete(userId);
  if (map.size === 0) typingUsers.delete(conversationId);
};

const getTypingUsers = (conversationId) => {
  const map = typingUsers.get(conversationId);
  if (!map) return [];
  const now = Date.now();
  const active = [];
  for (const [userId, expiresAt] of map.entries()) {
    if (expiresAt > now) active.push(userId);
    else map.delete(userId);
  }
  return active;
};

module.exports = {
  addSocket,
  removeSocket,
  isOnline,
  getOnlineUserIds,
  setTyping,
  clearTyping,
  getTypingUsers,
};