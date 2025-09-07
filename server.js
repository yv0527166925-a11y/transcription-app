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

    app.post('/api/stripe-webhook', express.raw({type: 'application/json'}), (req, res) => {
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) return res.status(400).send('Webhook secret not configured.');
        
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

app.use(express.json());

// --- Services Configuration & Data ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});
const users = new Map();
initializeDemoUsers();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, upload
