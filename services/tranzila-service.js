/**
 * 🏦 Tranzila Payment Service - Hosted Payment Page Integration
 * שירות תשלומים טרנזילה - אינטגרציה עם דף תשלום מתארח
 */

const crypto = require('crypto');
const axios = require('axios');

class TranzilaService {
  constructor() {
    // Tranzila configuration
    this.config = {
      terminalId: process.env.TRANZILA_TERMINAL_ID || '',
      username: process.env.TRANZILA_USERNAME || '',
      password: process.env.TRANZILA_PASSWORD || '',
      isProduction: process.env.NODE_ENV === 'production',

      // URLs - Mini Store
      hostedPageUrl: 'https://pay.tranzila.com/fxptimlulh',

      // Callback URLs
      successUrl: process.env.BASE_URL + '/payment/success',
      errorUrl: process.env.BASE_URL + '/payment/error',
      callbackUrl: process.env.BASE_URL + '/api/payment/callback'
    };

    // Package options with prices (in ILS)
    this.packages = {
      'package_60': { minutes: 60, price: 10, name: 'חבילת 60 דקות' },
      'package_120': { minutes: 120, price: 20, name: 'חבילת 120 דקות' },
      'package_180': { minutes: 180, price: 30, name: 'חבילת 180 דקות' },
      'package_240': { minutes: 240, price: 40, name: 'חבילת 240 דקות' },
      'package_300': { minutes: 300, price: 50, name: 'חבילת 300 דקות' },
      'package_600': { minutes: 600, price: 100, name: 'חבילת 600 דקות' },
      'package_1200': { minutes: 1200, price: 200, name: 'חבילת 1200 דקות' },
      'package_1800': { minutes: 1800, price: 300, name: 'חבילת 1800 דקות' },
      'package_2400': { minutes: 2400, price: 400, name: 'חבילת 2400 דקות' },
      'package_3000': { minutes: 3000, price: 500, name: 'חבילת 3000 דקות' }
    };
  }

  /**
   * Creates payment URL for Tranzila hosted page
   * יוצר URL לתשלום בדף המתארח של טרנזילה
   */
  createPaymentUrl(userEmail, packageType, orderId, userName = '') {
    if (!this.packages[packageType]) {
      throw new Error('Invalid package type');
    }

    const packageInfo = this.packages[packageType];
    const amount = packageInfo.price;

    // Payment parameters for Mini Store
    const params = {
      // Basic payment info
      sum: amount.toString(),
      currency: '1', // ILS

      // Customer details - מיני חנות של טרנזילה
      email: userEmail,
      contact: userName || userEmail.split('@')[0], // השם יופיע פה

      // Order details - נכלול את השם בהערות גם
      remarks: userName ?
        `${packageInfo.name} - ${packageInfo.minutes} דקות - עבור: ${userName}` :
        `${packageInfo.name} - ${packageInfo.minutes} דקות`,

      // Custom tracking - נעביר שם גם דרך custom field
      custom1: packageType,
      custom2: packageInfo.minutes.toString(),
      custom3: userName || userEmail.split('@')[0] // השם פה במקום orderId
    };

    console.log(`💳 Payment URL params:`, {
      email: params.email,
      contact: params.contact,
      custom3: params.custom3,
      remarks: params.remarks,
      userName: userName,
      amount: params.sum
    });

    // Create query string
    const queryString = Object.keys(params)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    return `${this.config.hostedPageUrl}?${queryString}`;
  }

  /**
   * Validates callback from Tranzila
   * מאמת callback מטרנזילה (מותאם למיני חנות)
   */
  validateCallback(callbackData) {
    try {
      // Check if transaction was successful (מיני חנות מחזירה Response במקום TranzilaToken)
      const isSuccess = callbackData.Response === '000' && callbackData.ConfirmationCode;

      if (!isSuccess) {
        console.log('❌ Payment failed:', callbackData.Response, callbackData.ResponseText);
        return { success: false, error: callbackData.ResponseText || 'Payment failed' };
      }

      // במיני חנות, הנתונים מגיעים בשדות שונים
      console.log('🔍 Looking for user data in callback:', {
        email: callbackData.email,
        contact: callbackData.contact,
        custom1: callbackData.custom1,
        custom2: callbackData.custom2,
        custom3: callbackData.custom3
      });

      // נחפש את האימייל בשדות הרלוונטיים
      const userEmail = callbackData.email || callbackData.custom1;
      const userName = callbackData.contact || '';

      if (!userEmail) {
        console.error('❌ No user email found in callback data!');
        return { success: false, error: 'User email not found in payment data' };
      }

      const amount = parseFloat(callbackData.sum);
      const confirmationCode = callbackData.ConfirmationCode;

      // חישוב דקות לפי החבילות המוגדרות במיני חנות
      const minutes = this.calculateMinutesFromAmount(amount);

      console.log('✅ Payment successful from mini-store:', {
        userEmail,
        userName,
        amount,
        minutes,
        confirmationCode
      });

      return {
        success: true,
        data: {
          userEmail,
          minutes,
          amount,
          confirmationCode,
          transactionDate: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('❌ Callback validation error:', error);
      return { success: false, error: 'Invalid callback data' };
    }
  }

  /**
   * Generates unique order ID
   * יוצר מזהה הזמנה ייחודי
   */
  generateOrderId(userEmail, packageType) {
    const timestamp = Date.now();
    const userHash = crypto.createHash('md5').update(userEmail).digest('hex').substring(0, 6);
    return `TXN_${userHash}_${packageType}_${timestamp}`;
  }

  /**
   * Get package details
   * מחזיר פרטי חבילה
   */
  getPackage(packageType) {
    return this.packages[packageType] || null;
  }

  /**
   * Get all available packages
   * מחזיר את כל החבילות הזמינות
   */
  getAllPackages() {
    return this.packages;
  }

  /**
   * Calculate minutes from payment amount
   * מחשב דקות לפי סכום התשלום (מזהה את החבילה הנכונה)
   */
  calculateMinutesFromAmount(amount) {
    // חיפוש חבילה לפי מחיר מדויק
    const exactMatch = Object.values(this.packages).find(pkg => pkg.price === amount);
    if (exactMatch) {
      console.log(`📦 Found exact package match: ${exactMatch.name} (${exactMatch.minutes} minutes for ${amount} ILS)`);
      return exactMatch.minutes;
    }

    // אם אין התאמה מדויקת, נבדוק אם זה סכום של כמה חבילות
    const possibleCombinations = this.findPackageCombinations(amount);
    if (possibleCombinations.length > 0) {
      const totalMinutes = possibleCombinations.reduce((total, pkg) => total + pkg.minutes, 0);
      console.log(`📦 Found package combination: ${possibleCombinations.map(p => p.name).join(' + ')} (${totalMinutes} minutes for ${amount} ILS)`);
      return totalMinutes;
    }

    // במקרה שלא מצאנו התאמה, נשתמש ביחס הבסיסי
    console.log(`⚠️ No exact package match for ${amount} ILS, using basic ratio`);
    return Math.floor(amount / 0.1667); // 10 ש"ח = 60 דקות
  }

  /**
   * Find best package combination for a given amount using dynamic programming
   * מוצא את הצירוף הטוב ביותר של חבילות לסכום נתון
   */
  findPackageCombinations(targetAmount) {
    const packages = Object.values(this.packages).sort((a, b) => b.price - a.price); // סדר יורד לפי מחיר

    // אלגוריתם greedy - נתחיל מהחבילות הגדולות ביותר
    const result = [];
    let remainingAmount = targetAmount;

    for (const pkg of packages) {
      while (remainingAmount >= pkg.price) {
        result.push(pkg);
        remainingAmount -= pkg.price;
      }
    }

    // בדיקה שהגענו לסכום המדויק
    if (remainingAmount === 0) {
      return result;
    }

    return []; // לא מצאנו צירוף מתאים
  }

  /**
   * Validates configuration
   * בודק תקינות התצורה
   */
  validateConfig() {
    const required = ['terminalId', 'username', 'password'];
    const missing = required.filter(field => !this.config[field]);

    if (missing.length > 0) {
      console.error('❌ Missing Tranzila config:', missing);
      return false;
    }

    console.log('✅ Tranzila config validated');
    return true;
  }
}

module.exports = TranzilaService;