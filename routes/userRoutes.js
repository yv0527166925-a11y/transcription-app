const express = require('express');
const router = express.Router();
const {
    findOrCreateUser,
    checkUserMinutes,
    addUserMinutes,
    getUserStats,
    getUserHistory
} = require('../utils/userHelpers');

// GET /api/users/:email/stats - קבלת סטטיסטיקות משתמש
router.get('/:email/stats', async (req, res) => {
    try {
        const { email } = req.params;

        const stats = await getUserStats(email);

        if (!stats) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            stats: stats
        });

    } catch (error) {
        console.error('❌ Error getting user stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/users/:email/history - קבלת היסטוריית תמלולים
router.get('/:email/history', async (req, res) => {
    try {
        const { email } = req.params;
        const limit = parseInt(req.query.limit) || 10;

        const history = await getUserHistory(email, limit);

        res.json({
            success: true,
            history: history
        });

    } catch (error) {
        console.error('❌ Error getting user history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/users/:email/minutes - הוספת דקות למשתמש
router.post('/:email/minutes', async (req, res) => {
    try {
        const { email } = req.params;
        const { minutes } = req.body;

        if (!minutes || minutes <= 0) {
            return res.status(400).json({ error: 'Invalid minutes amount' });
        }

        // וודא שהמשתמש קיים
        const user = await findOrCreateUser(email);

        // הוסף דקות
        const updatedUser = await addUserMinutes(email, minutes);

        res.json({
            success: true,
            message: `Added ${minutes} minutes`,
            minutesRemaining: updatedUser.minutesRemaining
        });

    } catch (error) {
        console.error('❌ Error adding minutes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/users/:email/check-minutes/:duration - בדיקת זמינות דקות
router.get('/:email/check-minutes/:duration', async (req, res) => {
    try {
        const { email, duration } = req.params;
        const requiredMinutes = parseFloat(duration);

        const check = await checkUserMinutes(email, requiredMinutes);

        res.json({
            success: true,
            hasEnough: check.hasEnough,
            required: requiredMinutes,
            remaining: check.remaining,
            needsMore: Math.max(0, requiredMinutes - check.remaining)
        });

    } catch (error) {
        console.error('❌ Error checking minutes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/users/:email/create - יצירת משתמש חדש (או קבלת קיים)
router.post('/:email/create', async (req, res) => {
    try {
        const { email } = req.params;

        const user = await findOrCreateUser(email);

        res.json({
            success: true,
            user: {
                email: user.email,
                minutesRemaining: user.minutesRemaining,
                totalMinutesUsed: user.totalMinutesUsed,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin
            }
        });

    } catch (error) {
        console.error('❌ Error creating/finding user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;