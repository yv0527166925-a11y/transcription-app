const jwt = require('jsonwebtoken');

// JWT Secret - בסביבת ייצור צריך להיות במשתני סביבה!
const JWT_SECRET = process.env.JWT_SECRET || 'temp-secret-change-in-production-12345!@#$%';

/**
 * Middleware לאימות משתמש
 * בודק אם יש token תקף ב-header
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({
      error: 'Access denied. No token provided.',
      hebrewError: 'נדרשת התחברות למערכת'
    });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified; // הוספת מידע המשתמש ל-request
    next();
  } catch (err) {
    return res.status(403).json({
      error: 'Invalid or expired token.',
      hebrewError: 'Token לא תקף או פג תוקף'
    });
  }
}

/**
 * Middleware לבדיקה שהמשתמש הוא אדמין
 * חייב לרוץ אחרי authenticateToken!
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      hebrewError: 'נדרשת התחברות'
    });
  }

  if (!req.user.isAdmin) {
    return res.status(403).json({
      error: 'Admin access required',
      hebrewError: 'נדרשות הרשאות אדמין'
    });
  }

  next();
}

/**
 * יצירת JWT token למשתמש
 */
function generateToken(user) {
  const payload = {
    email: user.email,
    isAdmin: user.isAdmin || false,
    name: user.name
  };

  // Token תקף ל-7 ימים
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = {
  authenticateToken,
  requireAdmin,
  generateToken,
  JWT_SECRET
};
