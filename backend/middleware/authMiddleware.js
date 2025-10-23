// middleware/authMiddleware.js
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(401).json({ sucess: false, message: "Not authenticated. Please log in to access this resource" });
  }
};

module.exports = { requireAuth };