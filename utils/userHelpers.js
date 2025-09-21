// JSON-based user management (MongoDB disabled)
const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '..', 'users_data.json');

function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = fs.readFileSync(USERS_FILE, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error('Error loading users:', error);
        return [];
    }
}

function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error saving users:', error);
        return false;
    }
}

function findUser(email) {
    const users = loadUsers();
    return users.find(user => user.email.toLowerCase() === email.toLowerCase());
}

function updateUser(email, updates) {
    const users = loadUsers();
    const userIndex = users.findIndex(user => user.email.toLowerCase() === email.toLowerCase());
    if (userIndex !== -1) {
        users[userIndex] = { ...users[userIndex], ...updates };
        if (saveUsers(users)) {
            return users[userIndex];
        }
    }
    return null;
}

/**
 * מוצא או יוצר משתמש חדש
 */
async function findOrCreateUser(email) {
    try {
        let user = findUser(email);

        if (!user) {
            console.log(`👤 Creating new user: ${email}`);
            const users = loadUsers();
            user = {
                id: Date.now(),
                email: email.toLowerCase(),
                name: email.toLowerCase(), // Default name
                password: 'temp123', // Default password
                isAdmin: false,
                remainingMinutes: 5, // 5 דקות חינם לכל משתמש חדש
                totalTranscribed: 0,
                history: [],
                joinDate: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            };
            users.push(user);
            saveUsers(users);
            console.log(`✅ New user created with 5 free minutes`);
        } else {
            // עדכן תאריך הכניסה האחרונה
            updateUser(email, { lastLogin: new Date().toISOString() });
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
        const user = findUser(email);

        if (!user) {
            return { hasEnough: false, remaining: 0, user: null };
        }

        console.log(`🔍 User ${email}: has ${user.remainingMinutes} minutes, needs ${requiredMinutes} minutes`);

        const hasEnough = user.remainingMinutes >= requiredMinutes;

        return {
            hasEnough: hasEnough,
            remaining: user.remainingMinutes,
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
        const user = findUser(email);

        if (!user) {
            throw new Error('User not found');
        }

        if (user.remainingMinutes < minutesUsed) {
            throw new Error('Not enough minutes remaining');
        }

        const newRemainingMinutes = user.remainingMinutes - minutesUsed;
        const newTotalUsed = user.totalTranscribed + minutesUsed;

        const updatedUser = updateUser(email, {
            remainingMinutes: newRemainingMinutes,
            totalTranscribed: newTotalUsed
        });

        console.log(`⏱️ User ${email} used ${minutesUsed} minutes. Remaining: ${newRemainingMinutes}`);

        return updatedUser;
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
        const user = findUser(email);

        if (!user) {
            throw new Error('User not found');
        }

        const newBalance = user.remainingMinutes + minutesToAdd;
        const updatedUser = updateUser(email, { remainingMinutes: newBalance });

        console.log(`➕ Added ${minutesToAdd} minutes to user ${email}. Total: ${newBalance}`);

        return updatedUser;
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
        const user = findUser(email);

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
            status: transcriptionData.status || 'completed',
            createdAt: new Date().toISOString()
        };

        // Add to beginning of history array
        const currentHistory = user.history || [];
        currentHistory.unshift(historyEntry);

        // Keep only last 100 transcriptions
        if (currentHistory.length > 100) {
            currentHistory.splice(100);
        }

        const updatedUser = updateUser(email, { history: currentHistory });

        console.log(`📝 Added transcription to history for user ${email}`);

        return updatedUser;
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
        const user = findUser(email);

        if (!user) {
            return null;
        }

        return {
            totalMinutesUsed: user.totalTranscribed || 0,
            minutesRemaining: user.remainingMinutes || 0,
            totalTranscriptions: (user.history || []).length,
            lastTranscription: (user.history || [])[0]?.createdAt || null
        };
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
        const user = findUser(email);

        if (!user) {
            return [];
        }

        const history = user.history || [];
        return history.slice(0, limit);
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

        const users = loadUsers();
        let modifiedCount = 0;

        users.forEach(user => {
            if (user.history && user.history.length > 0) {
                const originalLength = user.history.length;
                user.history = user.history.filter(entry => {
                    const entryDate = new Date(entry.createdAt);
                    return entryDate >= cutoffDate;
                });

                if (user.history.length !== originalLength) {
                    modifiedCount++;
                }
            }
        });

        if (modifiedCount > 0) {
            saveUsers(users);
        }

        console.log(`🧹 Cleaned up old transcription history: ${modifiedCount} users affected`);

        return { modifiedCount };
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