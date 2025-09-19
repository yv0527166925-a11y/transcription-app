#!/usr/bin/env node

const mongoose = require('mongoose');
require('dotenv').config();

async function testConnection() {
    try {
        console.log('🔗 Testing MongoDB connection...');

        const mongoURI = process.env.MONGODB_URI;

        if (!mongoURI) {
            console.error('❌ MONGODB_URI not found in .env file');
            console.log('Please add your MongoDB connection string to .env file:');
            console.log('MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database');
            process.exit(1);
        }

        console.log('📋 MongoDB URI found');
        console.log('🔌 Attempting connection...');

        const conn = await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            bufferCommands: false,
        });

        console.log(`✅ MongoDB Connected Successfully!`);
        console.log(`🏠 Host: ${conn.connection.host}`);
        console.log(`📊 Database: ${conn.connection.name}`);
        console.log(`🚀 Ready state: ${conn.connection.readyState}`);

        // בדיקה פשוטה של יצירת document
        const testSchema = new mongoose.Schema({
            message: String,
            timestamp: { type: Date, default: Date.now }
        });

        const TestModel = mongoose.model('ConnectionTest', testSchema);

        const testDoc = new TestModel({ message: 'Connection test successful' });
        await testDoc.save();

        console.log('✅ Test document created successfully');

        // מחיקה של document הבדיקה
        await TestModel.deleteOne({ _id: testDoc._id });
        console.log('🧹 Test document cleaned up');

        await mongoose.connection.close();
        console.log('🔌 Connection closed');
        console.log('');
        console.log('🎉 MongoDB is ready to use!');
        console.log('You can now start your server with: npm start');

    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);

        if (error.message.includes('authentication')) {
            console.log('💡 Check your username and password in MONGODB_URI');
        } else if (error.message.includes('network')) {
            console.log('💡 Check your internet connection and MongoDB cluster status');
        } else if (error.message.includes('timeout')) {
            console.log('💡 Connection timeout - check if IP is whitelisted in MongoDB Atlas');
        } else if (error.message.includes('buffermaxentries')) {
            console.log('💡 Deprecated option detected - this should be fixed now');
        }

        process.exit(1);
    }
}

testConnection();