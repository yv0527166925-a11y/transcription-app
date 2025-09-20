const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function fixUserBalance() {
    try {
        // חיבור למונגו
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // מצא את המשתמש
        const userEmail = 'yv0527166925@gmail.com';
        const user = await User.findOne({ email: userEmail.toLowerCase() });

        if (!user) {
            console.log('❌ User not found:', userEmail);
            return;
        }

        console.log('👤 Current user data:');
        console.log('📧 Email:', user.email);
        console.log('⏱️ Current balance:', user.minutesRemaining);
        console.log('📊 Total used:', user.totalMinutesUsed);
        console.log('📅 Created:', user.createdAt);

        // עדכן את היתרה ל-1000 דקות
        const oldBalance = user.minutesRemaining;
        user.minutesRemaining = 1000;
        await user.save();

        console.log('✅ User balance updated successfully!');
        console.log(`💰 Balance: ${oldBalance} → ${user.minutesRemaining} minutes`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
    }
}

fixUserBalance();