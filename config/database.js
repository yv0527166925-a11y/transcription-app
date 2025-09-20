const mongoose = require('mongoose');

// הגדרות Mongoose גלובליות - מניעת אזהרות
mongoose.set('strictQuery', false);

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI;

        if (!mongoURI) {
            console.error('❌ MONGODB_URI not found in environment variables');
            console.log('Please add MONGODB_URI to your .env file');
            process.exit(1);
        }

        console.log('🔗 Connecting to MongoDB...');

        const conn = await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            bufferCommands: false,
        });

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`📊 Database: ${conn.connection.name}`);

        // מאזין לאירועי חיבור
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('⚠️ MongoDB disconnected');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('🔄 MongoDB reconnected');
        });

        return conn;

    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);

        // הדפס פרטים נוספים לדיבוג
        if (error.message.includes('authentication')) {
            console.log('💡 Check your MongoDB username and password');
        } else if (error.message.includes('network')) {
            console.log('💡 Check your network connection and MongoDB URL');
        } else if (error.message.includes('timeout')) {
            console.log('💡 MongoDB connection timeout - check if MongoDB service is running');
        }

        throw error; // Let the calling function handle the error
    }
};

// פונקציה לניתוק חלק מהמסד נתונים
const disconnectDB = async () => {
    try {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
    } catch (error) {
        console.error('❌ Error closing MongoDB connection:', error);
    }
};

// טיפול בסגירת האפליקציה
process.on('SIGINT', async () => {
    await disconnectDB();
    process.exit(0);
});

module.exports = { connectDB, disconnectDB };