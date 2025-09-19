#!/usr/bin/env node

require('dotenv').config();

console.log('🔍 MongoDB Render Deployment Debug');
console.log('===================================');

// בדיקות שכיחות לבעיות ב-Render
console.log('\n1️⃣ Environment Variables Check:');
console.log(`MONGODB_URI: ${process.env.MONGODB_URI ? '✅ Found' : '❌ Missing'}`);

if (process.env.MONGODB_URI) {
    const uri = process.env.MONGODB_URI;

    console.log('\n2️⃣ URI Format Analysis:');

    // בדיקת פורמט כללי
    if (uri.startsWith('mongodb+srv://')) {
        console.log('✅ Atlas SRV format');

        // בדיקת רכיבים חשובים
        const hasUser = uri.includes('://') && uri.split('://')[1].includes(':');
        const hasPassword = hasUser && uri.split(':').length >= 3;
        const hasCluster = uri.includes('@') && uri.split('@')[1].includes('.');
        const hasDatabase = uri.split('/').length > 3 && uri.split('/')[3].length > 0;

        console.log(`- Username: ${hasUser ? '✅' : '❌'}`);
        console.log(`- Password: ${hasPassword ? '✅' : '❌'}`);
        console.log(`- Cluster: ${hasCluster ? '✅' : '❌'}`);
        console.log(`- Database: ${hasDatabase ? '✅' : '❌'}`);

        if (hasCluster) {
            const clusterPart = uri.split('@')[1].split('/')[0];
            console.log(`- Cluster URL: ${clusterPart}`);
        }

    } else {
        console.log('❌ Not Atlas SRV format');
    }
}

console.log('\n3️⃣ Common Render Issues:');
console.log('Check these in your Render dashboard:');
console.log('');
console.log('📋 Environment Variables:');
console.log('   ✓ MONGODB_URI is set');
console.log('   ✓ No extra spaces before/after');
console.log('   ✓ Quotes removed (if any)');
console.log('');
console.log('🔐 MongoDB Atlas Security:');
console.log('   ✓ IP Whitelist: 0.0.0.0/0 (allow all)');
console.log('   ✓ Database user created');
console.log('   ✓ Password has no special chars (@#$%^&*)');
console.log('   ✓ Cluster is active (not paused)');
console.log('');
console.log('🌐 Network & DNS:');
console.log('   ✓ Cluster URL is reachable');
console.log('   ✓ SRV records working');
console.log('   ✓ No firewall blocking');

console.log('\n4️⃣ Debugging Steps:');
console.log('1. Copy exact MONGODB_URI from Atlas');
console.log('2. Test locally first (replace .env temporarily)');
console.log('3. Check Render logs for exact error');
console.log('4. Verify Atlas cluster status');
console.log('5. Test connection from Atlas "Connect" button');

console.log('\n5️⃣ Sample Working Format:');
console.log('MONGODB_URI=mongodb+srv://user:pass@cluster0.abcde.mongodb.net/dbname?retryWrites=true&w=majority');

console.log('\n✅ Debug complete - check these items in Render!');