const service = require('./chatbot.service');

const sendMessage = async (req, res, next) => {
  try {
    const result = await service.sendMessage(req.user.id, req.body.message);
    res.status(201).json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
};

const getHistory = async (req, res, next) => {
  try {
    const { page, limit } = req.query; // validated + defaulted by validate()
    const result = await service.getSessionHistory(req.user.id, page, limit);
    res.status(200).json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
};

const closeSession = async (req, res, next) => {
  try {
    const session = await service.closeSession(req.user.id);
    res.status(200).json({ success: true, message: 'Session closed', session });
  } catch (e) {
    next(e);
  }
};

module.exports = { sendMessage, getHistory, closeSession };