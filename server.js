const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); // To parse JSON bodies
app.use(express.static(path.join(__dirname))); // Serve static files like index.html

// --- In-memory Data ---
const users = new Map();
users.set('admin@example.com', { id: 'admin', name: 'מנהל', email: 'admin@example.com', password: 'admin123', isAdmin: true });
users.set('test@example.com', { id: 'test123', name: 'בודק', email: 'test@example.com', password: 'test123', isAdmin: false });
console.log('✅ Simplified server: Demo users initialized.');


// --- API Routes ---
app.post('/api/login', (req, res) => {
  console.log('Received login request:', req.body);
  const { email, password } = req.body;
  const user = users.get(email);

  if (!user || user.password !== password) {
    console.log(`Login failed for ${email}`);
    return res.status(401).json({ success: false, error: 'אימייל או סיסמה שגויים' });
  }

  console.log(`Login successful for ${email}`);
  const { password: _, ...userToReturn } = user;
  res.json({ success: true, user: userToReturn });
});

app.post('/api/register', (req, res) => {
    console.log('Received register request:', req.body);
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ success: false, error: 'נא למלא את כל השדות' });
    }
    if (users.has(email)) {
        return res.status(409).json({ success: false, error: 'משתמש עם אימייל זה כבר קיים' });
    }
    const newUser = { id: Date.now().toString(), name, email, password, isAdmin: false };
    users.set(email, newUser);
    console.log(`✅ New user registered: ${email}`);
    const { password: _, ...userToReturn } = newUser;
    res.status(201).json({ success: true, user: userToReturn });
});


// --- Base Route ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


app.listen(PORT, () => {
  console.log(`🚀 Simplified Server is live on port ${PORT}`);
});
