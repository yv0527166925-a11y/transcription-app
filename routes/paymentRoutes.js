const express = require('express');
const router = express.Router();
const TranzilaService = require('../services/tranzila-service');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// יצירת instance של שירות טרנזילה
const tranzilaService = new TranzilaService();

// נתיבי קבצים - משתמש באותה הגדרה כמו בשרת הראשי (אין דיסק קבוע בתוכנית החינמית)
const PERSISTENT_PATH = path.join(__dirname, '..');
const usersFilePath = path.join(PERSISTENT_PATH, 'users_data.json');
const transactionsFilePath = path.join(PERSISTENT_PATH, 'transactions_data.json');

// פונקציות עזר לעבודה עם JSON
function readUsersData() {
    try {
        if (fs.existsSync(usersFilePath)) {
            const data = fs.readFileSync(usersFilePath, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error('❌ Error reading users data:', error);
        return [];
    }
}

function writeUsersData(users) {
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('❌ Error writing users data:', error);
        return false;
    }
}

function findUserByEmail(email) {
    const users = readUsersData();
    return users.find(user => user.email.toLowerCase() === email.toLowerCase());
}

function addMinutesToUser(email, minutes) {
    const users = readUsersData();
    const userIndex = users.findIndex(user => user.email.toLowerCase() === email.toLowerCase());

    if (userIndex === -1) {
        return null;
    }

    users[userIndex].remainingMinutes = (users[userIndex].remainingMinutes || 0) + minutes;
    writeUsersData(users);
    return users[userIndex];
}

function saveTransaction(transactionData) {
    try {
        let transactions = [];
        if (fs.existsSync(transactionsFilePath)) {
            const data = fs.readFileSync(transactionsFilePath, 'utf8');
            transactions = JSON.parse(data);
        }

        // בדיקה שהעסקה לא קיימת כבר
        const existingTransaction = transactions.find(t => t.confirmationCode === transactionData.confirmationCode);
        if (existingTransaction) {
            return existingTransaction;
        }

        const newTransaction = {
            id: transactions.length + 1,
            ...transactionData,
            createdAt: new Date().toISOString()
        };

        transactions.push(newTransaction);
        fs.writeFileSync(transactionsFilePath, JSON.stringify(transactions, null, 2), 'utf8');
        return newTransaction;
    } catch (error) {
        console.error('❌ Error saving transaction:', error);
        return null;
    }
}

/**
 * POST /api/payment/initiate
 * יצירת עסקת תשלום חדשה והפניה לטרנזילה
 */
router.post('/initiate', async (req, res) => {
    try {
        const { userEmail, packageType = 'package_60' } = req.body;

        if (!userEmail) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        // בדיקה שהחבילה קיימת
        const packageDetails = tranzilaService.getPackage(packageType);
        if (!packageDetails) {
            return res.status(400).json({
                success: false,
                error: 'Invalid package type'
            });
        }

        // מציאת שם המשתמש מהמערכת הראשית
        let userName = '';
        try {
            const serverUrl = 'https://transcription-app-2uci.onrender.com';
            const userSyncResponse = await axios.post(`${serverUrl}/api/user-sync`, {
                email: userEmail
            }, { timeout: 5000 });

            if (userSyncResponse.data.success && userSyncResponse.data.user) {
                userName = userSyncResponse.data.user.name || '';
                console.log(`👤 Found user name from main server: "${userName}"`);
            } else {
                console.log(`👤 User not found in main server: ${userEmail}`);
            }
        } catch (userLookupError) {
            console.error('⚠️ Failed to lookup user from main server:', userLookupError.message);
            // Fallback to local JSON lookup
            const localUser = findUserByEmail(userEmail);
            userName = localUser ? localUser.name : '';
            console.log(`👤 Fallback to local lookup, using: "${userName}"`);
        }

        // יצירת מזהה הזמנה ייחודי
        const orderId = tranzilaService.generateOrderId(userEmail, packageType);

        // יצירת URL לתשלום
        const paymentUrl = tranzilaService.createPaymentUrl(userEmail, packageType, orderId, userName);

        console.log(`💳 Created payment URL for ${userEmail}: ${orderId}`);

        res.json({
            success: true,
            paymentUrl,
            orderId,
            packageDetails
        });

    } catch (error) {
        console.error('❌ Payment initiation error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/payment/callback
 * Webhook מטרנזילה - מקבל התראה על תשלום שהושלם
 */
router.post('/callback', async (req, res) => {
    try {
        console.log('📞 Tranzila callback received:', JSON.stringify(req.body, null, 2));

        // אימות הנתונים מטרנזילה
        const validation = tranzilaService.validateCallback(req.body);

        if (!validation.success) {
            console.log('❌ Invalid callback:', validation.error);
            return res.status(400).send('Invalid callback');
        }

        const { userEmail, minutes, amount, confirmationCode } = validation.data;

        // בדיקה שהעסקה לא עובדה כבר (למניעת עיבוד כפול)
        let transactions = [];
        if (fs.existsSync(transactionsFilePath)) {
            const data = fs.readFileSync(transactionsFilePath, 'utf8');
            transactions = JSON.parse(data);
        }

        const existingTransaction = transactions.find(t => t.confirmationCode === confirmationCode);
        if (existingTransaction) {
            console.log('⚠️ Transaction already processed:', confirmationCode);
            return res.send('OK'); // עדיין מחזירים OK לטרנזילה
        }

        // מציאת המשתמש
        const user = findUserByEmail(userEmail);
        if (!user) {
            console.log('❌ User not found:', userEmail);
            console.log('📋 Available users:', readUsersData().map(u => u.email));
            return res.status(404).send('User not found');
        }

        console.log('✅ User found:', { email: user.email, currentMinutes: user.remainingMinutes });

        // הוספת הדקות למשתמש
        const updatedUser = addMinutesToUser(userEmail, minutes);
        if (!updatedUser) {
            console.log('❌ Failed to update user minutes');
            return res.status(500).send('Failed to update user');
        }

        console.log('✅ User updated successfully:', {
            email: updatedUser.email,
            newMinutes: updatedUser.remainingMinutes,
            minutesAdded: minutes
        });

        // יצירת רשומת עסקה
        const transaction = saveTransaction({
            userEmail,
            amount,
            minutes,
            confirmationCode,
            status: 'completed',
            metadata: req.body // שמירת כל הנתונים מטרנזילה
        });

        console.log(`✅ Payment processed successfully: ${userEmail} +${minutes} minutes (Transaction: ${confirmationCode})`);

        // עדכון המערכת הראשית - הודעה לשרת הראשי לרענן את הנתונים בזיכרון
        try {
            const serverUrl = 'https://transcription-app-2uci.onrender.com';
            console.log(`🔄 Attempting to reload users data at: ${serverUrl}/api/internal/reload-users`);

            const response = await axios.post(`${serverUrl}/api/internal/reload-users`, {
                userEmail,
                minutes,
                source: 'payment-callback'
            }, {
                timeout: 10000
            });

            console.log('✅ Main server users data reloaded successfully:', response.data);
        } catch (reloadError) {
            console.error('⚠️ Failed to reload main server users data:', reloadError.message);
            console.error('⚠️ Status:', reloadError.response?.status);
            console.error('⚠️ Response:', reloadError.response?.data);
            // לא נכשיל את התשלום בגלל זה - זה רק sync issue
        }

        // חובה לענות OK לטרנזילה
        res.send('OK');

    } catch (error) {
        console.error('❌ Callback processing error:', error);
        res.status(500).send('Error processing payment');
    }
});

/**
 * GET/POST /api/payment/success
 * דף הצלחה לאחר תשלום - תומך בשני שיטות
 */
router.get('/success', (req, res) => {
    res.redirect('/?payment=success');
});

router.post('/success', (req, res) => {
    res.redirect('/?payment=success');
});

/**
 * GET/POST /api/payment/error
 * דף שגיאה במקרה של כשל בתשלום - תומך בשני שיטות
 */
router.get('/error', (req, res) => {
    res.redirect('/?payment=error');
});

router.post('/error', (req, res) => {
    res.redirect('/?payment=error');
});

/**
 * GET /api/payment/packages
 * קבלת רשימת החבילות הזמינות
 */
router.get('/packages', (req, res) => {
    try {
        const packages = tranzilaService.getAllPackages();
        res.json({
            success: true,
            packages
        });
    } catch (error) {
        console.error('❌ Error getting packages:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * GET /api/payment/transactions/:email
 * קבלת היסטוריית עסקאות של משתמש
 */
router.get('/transactions/:email', (req, res) => {
    try {
        const { email } = req.params;
        const limit = parseInt(req.query.limit) || 10;

        let transactions = [];
        if (fs.existsSync(transactionsFilePath)) {
            const data = fs.readFileSync(transactionsFilePath, 'utf8');
            transactions = JSON.parse(data);
        }

        const userTransactions = transactions
            .filter(t => t.userEmail.toLowerCase() === email.toLowerCase())
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit);

        res.json({
            success: true,
            transactions: userTransactions
        });

    } catch (error) {
        console.error('❌ Error getting transactions:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;