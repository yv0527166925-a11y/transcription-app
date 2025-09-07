const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { Document, Paragraph, TextRun, Packer, AlignmentType } = require('docx');
const cors = require('cors');
const { spawn } = require('child_process');
require('dotenv').config();

// --- Environment Variable Check (for core services) ---
const requiredEnvVars = ['GEMINI_API_KEY', 'EMAIL_USER', 'EMAIL_PASS'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error(`❌ FATAL ERROR: Missing core environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname)));

// --- Conditional Stripe Integration ---
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
let stripe;
if (stripeSecretKey) {
    console.log("✅ Stripe keys found. Initializing payment system.");
    stripe = require('stripe')(stripeSecretKey);

    // The Stripe webhook needs the raw body, so we set it up before express.json()
    app.post('/api/stripe-webhook', express.raw({type: 'application/json'}), (req, res) => {
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            return res.status(400).send('Webhook secret not configured.');
        }
        let event;
        try {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } catch (err) {
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const userEmail = session.metadata.userEmail;
            const minutesPurchased = parseInt(session.metadata.minutesPurchased);
            const user = users.get(userEmail);
            if (user && minutesPurchased > 0) {
                user.remainingMinutes += minutesPurchased;
                console.log(`✅ Payment successful for ${userEmail}. Added ${minutesPurchased} minutes.`);
            }
        }
        res.json({received: true});
    });
} else {
    console.log("⚠️ Stripe keys not found. Payment system is disabled.");
}

app.use(express.json()); // Apply json parsing for all other routes

// --- Services Configuration ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// --- In-memory Data ---
const users = new Map();
initializeDemoUsers();

// (The rest of your server.js file remains the same)
function initializeDemoUsers() {
    users.set('admin@example.com', { id: 'admin', name: 'מנהל', email: 'admin@example.com', password: 'admin123', remainingMinutes: 9999, totalTranscribed: 0, isAdmin: true, history: [] });
    users.set('test@example.com', { id: 'test123', name: 'בודק', email: 'test@example.com', password: 'test123', remainingMinutes: 30, totalTranscribed: 0, isAdmin: false, history: [] });
    console.log('✅ Demo users initialized.');
}

// --- API Routes ---
app.get('/health', (req, res) => { res.status(200).send('OK'); });
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

// --- Conditional Stripe API Route ---
if (stripe) {
    app.post('/api/create-checkout-session', async (req, res) => {
        const { email, minutes, price, name } = req.body;
        try {
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: { currency: 'ils', product_data: { name: `${name} (${minutes} דקות)` }, unit_amount: price * 100 },
                    quantity: 1,
                }],
                mode: 'payment',
                success_url: `${req.headers.origin}?payment_success=true`,
                cancel_url: `${req.headers.origin}?payment_canceled=true`,
                metadata: { userEmail: email, minutesPurchased: minutes }
            });
            res.json({ id: session.id });
        } catch (error) {
            res.status(500).json({ error: 'Failed to create payment session.' });
        }
    });
}


// (The rest of your existing API routes: /api/login, /api/admin/add-minutes, /api/transcribe)
// (Make sure they are included here)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, `${Date.now()}_${safeName}`);
  }
});
const upload = multer({ storage });
async function getMediaDuration(filePath) {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
    let output = '';
    ffprobe.stdout.on('data', (data) => { output += data.toString(); });
    ffprobe.on('close', (code) => {
      if (code === 0 && output) {
        resolve(Math.ceil(parseFloat(output.trim()) / 60));
      } else {
        const stats = fs.statSync(filePath);
        resolve(Math.max(1, Math.ceil(stats.size / (1024 * 1024 * 2))));
      }
    });
    ffprobe.on('error', () => resolve(1));
  });
}
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.get(email);
  if (!user || user.password !== password) {
    return res.status(401).json({ success: false, error: 'אימייל או סיסמה שגויים' });
  }
  const { password: _, ...userToReturn } = user;
  res.json({ success: true, user: userToReturn });
});
app.post('/api/admin/add-minutes', (req, res) => {
    const { adminEmail, userEmail, minutes } = req.body;
    const adminUser = users.get(adminEmail);
    if (!adminUser || !adminUser.isAdmin) { return res.status(403).json({ success: false, error: 'Forbidden' }); }
    const targetUser = users.get(userEmail);
    if (!targetUser) { return res.status(404).json({ success: false, error: 'User not found' }); }
    const minutesToAdd = parseInt(minutes);
    if (isNaN(minutesToAdd) || minutesToAdd
