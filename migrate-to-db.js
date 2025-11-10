const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createTables() {
  console.log('🔧 Creating database tables...');

  try {
    // יצירת טבלת משתמשים
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        remaining_minutes INTEGER DEFAULT 0,
        total_transcribed INTEGER DEFAULT 0,
        join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        email_verified BOOLEAN DEFAULT TRUE,
        history JSONB DEFAULT '[]',
        transcription_history JSONB DEFAULT '[]'
      )
    `);

    // יצירת טבלת עסקאות
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        amount INTEGER NOT NULL,
        minutes INTEGER NOT NULL,
        confirmation_code VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Tables created successfully!');
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    throw error;
  }
}

async function migrateUsers() {
  console.log('📥 Migrating users data...');

  try {
    // קריאת נתוני משתמשים מהקובץ
    const usersData = JSON.parse(fs.readFileSync('./users_data.json', 'utf8'));

    for (const user of usersData) {
      await pool.query(`
        INSERT INTO users (id, name, email, password, is_admin, remaining_minutes, total_transcribed, join_date, history, transcription_history)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (email) DO UPDATE SET
          name = EXCLUDED.name,
          remaining_minutes = EXCLUDED.remaining_minutes,
          total_transcribed = EXCLUDED.total_transcribed
      `, [
        user.id,
        user.name,
        user.email,
        user.password,
        user.isAdmin || false,
        user.remainingMinutes || 0,
        user.totalTranscribed || 0,
        user.joinDate || new Date().toISOString(),
        JSON.stringify(user.history || []),
        JSON.stringify(user.transcriptionHistory || [])
      ]);
    }

    console.log(`✅ Migrated ${usersData.length} users`);
  } catch (error) {
    console.error('❌ Error migrating users:', error);
    throw error;
  }
}

async function migrateTransactions() {
  console.log('💰 Migrating transactions data...');

  try {
    // קריאת נתוני עסקאות מהקובץ
    const transactionsData = JSON.parse(fs.readFileSync('./transactions_data.json', 'utf8'));

    for (const transaction of transactionsData) {
      await pool.query(`
        INSERT INTO transactions (id, user_email, amount, minutes, confirmation_code, status, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata
      `, [
        transaction.id,
        transaction.userEmail,
        transaction.amount,
        transaction.minutes,
        transaction.confirmationCode,
        transaction.status,
        JSON.stringify(transaction.metadata || {}),
        transaction.createdAt || new Date().toISOString()
      ]);
    }

    console.log(`✅ Migrated ${transactionsData.length} transactions`);
  } catch (error) {
    console.error('❌ Error migrating transactions:', error);
    throw error;
  }
}

async function testConnection() {
  console.log('🔍 Testing database connection...');

  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connected successfully!', result.rows[0]);
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

async function main() {
  try {
    await testConnection();
    await createTables();
    await migrateUsers();
    await migrateTransactions();

    console.log('🎉 Migration completed successfully!');

    // בדיקה שהנתונים עברו
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    const transactionCount = await pool.query('SELECT COUNT(*) FROM transactions');

    console.log(`📊 Final counts:`);
    console.log(`   Users: ${userCount.rows[0].count}`);
    console.log(`   Transactions: ${transactionCount.rows[0].count}`);

  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();