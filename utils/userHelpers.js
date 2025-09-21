const User = require('../models/User');

/**
 * מוצא או יוצר משתמש חדש
 */
async function findOrCreateUser(email) {
    try {
        let user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            console.log(`👤 Creating new user: ${email}`);
            user = new User({
                email: email.toLowerCase(),
                minutesRemaining: 5, // 5 דקות חינם לכל משתמש חדש
                totalMinutesUsed: 0
            });
            await user.save();
            console.log(`✅ New user created with 5 free minutes`);
        } else {
            // עדכן תאריך הכניסה האחרונה
            user.lastLogin = new Date();
            await user.save();
        }

        return user;
    } catch (error) {
        console.error('❌ Error finding/creating user:', error);
        throw error;
    }
}

/**
 * בודק אם למשתמש יש מספיק דקות
 */
async function checkUserMinutes(email, requiredMinutes) {
    try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return { hasEnough: false, remaining: 0, user: null };
        }

        return {
            hasEnough: user.minutesRemaining >= requiredMinutes,
            remaining: user.minutesRemaining,
            user: user
        };
    } catch (error) {
        console.error('❌ Error checking user minutes:', error);
        throw error;
    }
}

/**
 * משתמש בדקות של משתמש
 */
async function useUserMinutes(email, minutesUsed) {
    try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            throw new Error('User not found');
        }

        if (user.minutesRemaining < minutesUsed) {
            throw new Error('Not enough minutes remaining');
        }

        await user.useMinutes(minutesUsed);

        console.log(`⏱️ User ${email} used ${minutesUsed} minutes. Remaining: ${user.minutesRemaining}`);

        return user;
    } catch (error) {
        console.error('❌ Error using user minutes:', error);
        throw error;
    }
}

/**
 * מוסיף דקות למשתמש
 */
async function addUserMinutes(email, minutesToAdd) {
    try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            throw new Error('User not found');
        }

        await user.addMinutes(minutesToAdd);

        console.log(`➕ Added ${minutesToAdd} minutes to user ${email}. Total: ${user.minutesRemaining}`);

        return user;
    } catch (error) {
        console.error('❌ Error adding user minutes:', error);
        throw error;
    }
}

/**
 * מוסיף תמלול להיסטוריה של המשתמש
 */
async function addTranscriptionToHistory(email, transcriptionData) {
    try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            throw new Error('User not found');
        }

        const historyEntry = {
            fileName: transcriptionData.fileName,
            originalName: transcriptionData.originalName,
            transcriptionText: transcriptionData.transcriptionText,
            wordDocumentPath: transcriptionData.wordDocumentPath,
            fileSize: transcriptionData.fileSize,
            processingTime: transcriptionData.processingTime,
            audioLength: transcriptionData.audioLength,
            language: transcriptionData.language || 'hebrew',
            status: transcriptionData.status || 'completed'
        };

        await user.addTranscription(historyEntry);

        console.log(`📝 Added transcription to history for user ${email}`);

        return user;
    } catch (error) {
        console.error('❌ Error adding transcription to history:', error);
        throw error;
    }
}

/**
 * מקבל סטטיסטיקות של המשתמש
 */
async function getUserStats(email) {
    try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return null;
        }

        return user.getUsageStats();
    } catch (error) {
        console.error('❌ Error getting user stats:', error);
        throw error;
    }
}

/**
 * מקבל היסטוריית תמלולים של המשתמש
 */
async function getUserHistory(email, limit = 10) {
    try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return [];
        }

        return user.transcriptionHistory.slice(0, limit);
    } catch (error) {
        console.error('❌ Error getting user history:', error);
        throw error;
    }
}

/**
 * מנקה היסטוריה ישנה (למשתמשים שלא פעילים)
 */
async function cleanupOldHistory(daysOld = 90) {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const result = await User.updateMany(
            {},
            {
                $pull: {
                    transcriptionHistory: {
                        createdAt: { $lt: cutoffDate }
                    }
                }
            }
        );

        console.log(`🧹 Cleaned up old transcription history: ${result.modifiedCount} users affected`);

        return result;
    } catch (error) {
        console.error('❌ Error cleaning up old history:', error);
        throw error;
    }
}

module.exports = {
    findOrCreateUser,
    checkUserMinutes,
    useUserMinutes,
    addUserMinutes,
    addTranscriptionToHistory,
    getUserStats,
    getUserHistory,
    cleanupOldHistory
};