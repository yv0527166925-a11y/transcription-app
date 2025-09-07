// הוסף בתחילת server.js אחרי const transcriptionJobs = new Map();

// Debug function to list all users
function debugListUsers() {
  console.log('🔧 Current users in system:');
  users.forEach((user, email) => {
    console.log(`   📧 ${email}: ${user.name} (${user.remainingMinutes} דקות, Admin: ${user.isAdmin})`);
  });
}

// עדכן את ה-API route להוספת דקות:
app.post('/api/admin/add-minutes', (req, res) => {
  console.log('🔧 Admin add minutes request received');
  console.log('🔧 Request body:', req.body);
  console.log('🔧 Request headers:', req.headers);
  
  debugListUsers(); // הדפס רשימת משתמשים
  
  const { userEmail, minutes } = req.body;
  
  // בדיקות בסיסיות
  if (!userEmail || !minutes) {
    console.log('❌ Missing fields:', { userEmail, minutes });
    return res.status(400).json({ 
      success: false, 
      error: 'חסרים פרטים: אימייל משתמש ומספר דקות' 
    });
  }
  
  // מציאת המשתמש
  const user = users.get(userEmail);
  console.log('🔧 Found user:', user ? 'YES' : 'NO');
  
  if (!user) {
    console.log('❌ User not found:', userEmail);
    console.log('🔧 Available users:', Array.from(users.keys()));
    return res.status(404).json({ 
      success: false, 
      error: `משתמש עם אימייל ${userEmail} לא נמצא` 
    });
  }
  
  // בדיקת תקינות הדקות
  const minutesToAdd = parseInt(minutes);
  if (isNaN(minutesToAdd) || minutesToAdd <= 0) {
    console.log('❌ Invalid minutes:', minutes);
    return res.status(400).json({ 
      success: false, 
      error: 'מספר הדקות חייב להיות מספר חיובי' 
    });
  }
  
  // הוספת הדקות
  const oldBalance = user.remainingMinutes;
  user.remainingMinutes += minutesToAdd;
  
  console.log(`✅ Added ${minutesToAdd} minutes to ${userEmail}`);
  console.log(`   Old balance: ${oldBalance}, New balance: ${user.remainingMinutes}`);
  
  res.json({
    success: true,
    message: `נוספו ${minutesToAdd} דקות למשתמש ${userEmail}`,
    oldBalance: oldBalance,
    newBalance: user.remainingMinutes,
    userFound: true
  });
});

// ועדכן את יצירת המשתמשים:
setTimeout(() => {
  // יצירת מנהל
  users.set('admin@example.com', {
    id: 'admin',
    name: 'מנהל המערכת',
    email: 'admin@example.com',
    password: 'admin123',
    phone: '',
    remainingMinutes: 9999,
    totalTranscribed: 0,
    isAdmin: true,
    history: [],
    createdAt: new Date()
  });
  
  // יצירת משתמש לבדיקה
  users.set('test@example.com', {
    id: 'test123',
    name: 'משתמש לבדיקה',
    email: 'test@example.com',
    password: 'test123',
    phone: '',
    remainingMinutes: 10,
    totalTranscribed: 0,
    isAdmin: false,
    history: [],
    createdAt: new Date()
  });
  
  console.log('👑 Admin user created: admin@example.com / admin123');
  console.log('👤 Test user created: test@example.com / test123');
  debugListUsers();
}, 1000);
