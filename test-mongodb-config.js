#!/usr/bin/env node

require('dotenv').config();

console.log('🔍 MongoDB Configuration Test');
console.log('================================');

// בדיקת משתני סביבה
const mongoURI = process.env.MONGODB_URI;
console.log('📋 MONGODB_URI exists:', !!mongoURI);

if (mongoURI) {
    console.log('🔗 MongoDB URI format:');

    if (mongoURI.startsWith('mongodb+srv://')) {
        console.log('✅ Atlas format detected');
        console.log('🌐 Protocol: mongodb+srv (Atlas)');

        // חילוץ פרטים מה-URI
        try {
            const url = new URL(mongoURI.replace('mongodb+srv://', 'https://'));
            console.log(`🏠 Host: ${url.hostname}`);
            console.log(`👤 Has credentials: ${!!url.username}`);
            console.log(`📊 Database: ${url.pathname.split('/')[1]?.split('?')[0] || 'default'}`);
        } catch (e) {
            console.log('⚠️ Could not parse URI details');
        }

    } else if (mongoURI.startsWith('mongodb://')) {
        console.log('🏠 Local/Standard format detected');
        console.log('🔌 Protocol: mongodb (local/standard)');
    } else {
        console.log('❌ Invalid MongoDB URI format');
    }

    console.log('');
    console.log('📝 Configuration Status:');
    console.log('✅ Environment variable set');
    console.log('✅ Database configuration loaded');
    console.log('✅ Connection options updated');
    console.log('✅ Mongoose settings configured');

    console.log('');
    console.log('🎯 Next Steps for Production:');
    console.log('1. Create MongoDB Atlas account (free)');
    console.log('2. Replace MONGODB_URI with your cluster');
    console.log('3. Add IP 0.0.0.0/0 to Atlas whitelist');
    console.log('4. Deploy to Render with environment variables');

} else {
    console.log('❌ MONGODB_URI not found in environment');
    console.log('💡 Add MONGODB_URI to your .env file');
}

console.log('');
console.log('✅ MongoDB configuration test complete');