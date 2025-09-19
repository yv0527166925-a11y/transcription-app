# 🗄️ MongoDB Setup Guide

מדריך התקנה מהיר למסד הנתונים MongoDB עבור מערכת התמלול.

## 📋 שלבי התקנה

### 1. יצירת חשבון MongoDB Atlas

1. גש ל-[MongoDB Atlas](https://cloud.mongodb.com)
2. צור חשבון חינם
3. צור Cluster חדש (M0 - חינם)
4. המתן לסיום הטעינה (כ-3-5 דקות)

### 2. הגדרת Access

1. **Database Access:**
   - לחץ על "Database Access" בתפריט השמאלי
   - לחץ "Add New Database User"
   - בחר "Password" authentication
   - הכנס שם משתמש וסיסמה חזקה
   - הגדר Role: "Atlas admin" או "Read and write to any database"
   - שמור את פרטי הגישה!

2. **Network Access:**
   - לחץ על "Network Access" בתפריט השמאלי
   - לחץ "Add IP Address"
   - בחר "Allow access from anywhere" (0.0.0.0/0)
   - או הוסף את IP הספציפי שלך

### 3. קבלת Connection String

1. לחץ על "Clusters" בתפריט השמאלי
2. לחץ "Connect" ליד הcluster שלך
3. בחר "Connect your application"
4. בחר "Node.js" driver
5. העתק את ה-connection string

דוגמה:
```
mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/transcription-app?retryWrites=true&w=majority
```

### 4. הגדרה בפרויקט

1. פתח את קובץ `.env` (או צור אותו)
2. הוסף את השורה הבאה:
```
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/transcription-app?retryWrites=true&w=majority
```

**החלף את:**
- `username` - שם המשתמש שיצרת
- `password` - הסיסמה שהגדרת
- `cluster0.xxxxx` - כתובת הcluster שלך

### 5. בדיקת החיבור

1. התקן את mongoose:
```bash
npm install mongoose
```

2. בדוק את החיבור:
```bash
npm run test-db
```

אם הכל עובד תראה:
```
✅ MongoDB Connected Successfully!
🎉 MongoDB is ready to use!
```

### 6. הפעלת השרת

```bash
npm start
```

## 🛠️ פתרון בעיות נפוצות

### בעיה: "Authentication failed"
**פתרון:** בדוק שם משתמש וסיסמה ב-connection string

### בעיה: "Network timeout"
**פתרון:** ודא שהוספת 0.0.0.0/0 ב-Network Access

### בעיה: "Database not found"
**פתרון:** MongoDB ייצור את הdatabase אוטומטית בשימוש ראשון

### בעיה: "buffermaxentries not supported"
**פתרון:** עודכן בקוד - השתמש בגרסה החדשה

## 📊 ניהול משתמשים

לאחר ההתקנה:
1. גש ל-`http://localhost:3000/admin.html`
2. חפש או צור משתמשים
3. נהל דקות והיסטוריה

## 🔒 אבטחה

- **לא תשמור** את ה-connection string בקוד
- **השתמש** רק בקובץ `.env`
- **אל תעלה** את קובץ `.env` לגיט
- **הגדר** IP restrictions במידת הצורך

## ✅ יתרונות MongoDB

- 🔄 **נתונים עמידים** - לא יאבדו בדפלוי
- 📈 **ניהול דקות מדויק** - מעקב אחר כל שימוש
- 📚 **היסטוריה מלאה** - כל התמלולים נשמרים
- 🚀 **ביצועים גבוהים** - מהיר וחזק
- 🌍 **נגישות מכל מקום** - cloud database