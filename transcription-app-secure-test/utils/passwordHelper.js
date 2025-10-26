const bcrypt = require('bcrypt');

// מספר הסיבובים להצפנה - ככל שיותר גבוה כך יותר בטוח אבל לוקח יותר זמן
const SALT_ROUNDS = 10;

/**
 * מצפין סיסמה באמצעות bcrypt
 * @param {string} plainPassword - הסיסמה הרגילה
 * @returns {Promise<string>} הסיסמה המוצפנת
 */
async function hashPassword(plainPassword) {
  try {
    const hashedPassword = await bcrypt.hash(plainPassword, SALT_ROUNDS);
    return hashedPassword;
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Failed to hash password');
  }
}

/**
 * משווה סיסמה רגילה לסיסמה מוצפנת
 * @param {string} plainPassword - הסיסמה הרגילה
 * @param {string} hashedPassword - הסיסמה המוצפנת
 * @returns {Promise<boolean>} האם הסיסמאות תואמות
 */
async function comparePassword(plainPassword, hashedPassword) {
  try {
    const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
    return isMatch;
  } catch (error) {
    console.error('Error comparing passwords:', error);
    throw new Error('Failed to compare passwords');
  }
}

/**
 * בודק אם סיסמה כבר מוצפנת (מתחילה ב-$2b$ שזה הסימן של bcrypt)
 * @param {string} password - הסיסמה לבדיקה
 * @returns {boolean} האם הסיסמה מוצפנת
 */
function isPasswordHashed(password) {
  return password && password.startsWith('$2b$');
}

module.exports = {
  hashPassword,
  comparePassword,
  isPasswordHashed
};
