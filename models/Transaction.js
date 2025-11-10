const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    minutes: {
        type: Number,
        required: true,
        min: 0
    },
    confirmationCode: {
        type: String,
        required: true,
        unique: true // למניעת עיבוד כפול של אותה עסקה
    },
    status: {
        type: String,
        enum: ['completed', 'failed', 'processing'],
        default: 'completed'
    },
    paymentMethod: {
        type: String,
        default: 'tranzila_mini_store'
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed, // לנתונים נוספים מטרנזילה
        default: {}
    }
}, {
    timestamps: true // יוסיף createdAt ו-updatedAt אוטומטית
});

// אינדקסים לחיפוש מהיר
transactionSchema.index({ userEmail: 1, createdAt: -1 });
transactionSchema.index({ confirmationCode: 1 });
transactionSchema.index({ createdAt: -1 });

// פונקציה סטטית לחיפוש עסקה לפי confirmation code
transactionSchema.statics.findByConfirmationCode = function(confirmationCode) {
    return this.findOne({ confirmationCode });
};

// פונקציה סטטית לקבלת עסקאות של משתמש
transactionSchema.statics.getUserTransactions = function(userEmail, limit = 10) {
    return this.find({ userEmail })
               .sort({ createdAt: -1 })
               .limit(limit);
};

module.exports = mongoose.model('Transaction', transactionSchema);