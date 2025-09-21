const mongoose = require('mongoose');

const transcriptionHistorySchema = new mongoose.Schema({
    fileName: { type: String, required: true },
    originalName: { type: String, required: true },
    transcriptionText: { type: String, required: true },
    wordDocumentPath: { type: String },
    createdAt: { type: Date, default: Date.now },
    fileSize: { type: Number },
    processingTime: { type: Number }, // זמן עיבוד בשניות
    audioLength: { type: Number }, // אורך האודיו בשניות
    language: { type: String, default: 'hebrew' },
    status: { type: String, enum: ['completed', 'failed', 'processing'], default: 'completed' }
});

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: { unique: true }
    },
    password: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    minutesRemaining: {
        type: Number,
        default: 0,
        min: 0
    },
    totalMinutesUsed: {
        type: Number,
        default: 0,
        min: 0
    },
    transcriptionHistory: [transcriptionHistorySchema],
    subscription: {
        type: { type: String, enum: ['free', 'basic', 'premium'], default: 'free' },
        startDate: { type: Date },
        endDate: { type: Date },
        autoRenew: { type: Boolean, default: false }
    },
    settings: {
        language: { type: String, default: 'hebrew' },
        emailNotifications: { type: Boolean, default: true },
        wordDocumentFormat: { type: String, enum: ['simple', 'formatted'], default: 'formatted' }
    },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true
});

// אינדקסים לחיפוש מהיר (email כבר unique אוטומטית)
userSchema.index({ createdAt: -1 });
userSchema.index({ 'transcriptionHistory.createdAt': -1 });

// פונקציות עזר
userSchema.methods.addTranscription = function(transcriptionData) {
    this.transcriptionHistory.unshift(transcriptionData);
    // שמור רק 100 תמלולים אחרונים לכל משתמש
    if (this.transcriptionHistory.length > 100) {
        this.transcriptionHistory = this.transcriptionHistory.slice(0, 100);
    }
    return this.save();
};

userSchema.methods.useMinutes = function(minutes) {
    if (this.minutesRemaining >= minutes) {
        this.minutesRemaining -= minutes;
        this.totalMinutesUsed += minutes;
        return this.save();
    } else {
        throw new Error('Not enough minutes remaining');
    }
};

userSchema.methods.addMinutes = function(minutes) {
    this.minutesRemaining += minutes;
    return this.save();
};

userSchema.methods.getUsageStats = function() {
    return {
        totalMinutesUsed: this.totalMinutesUsed,
        minutesRemaining: this.minutesRemaining,
        totalTranscriptions: this.transcriptionHistory.length,
        lastTranscription: this.transcriptionHistory[0]?.createdAt || null
    };
};

module.exports = mongoose.model('User', userSchema);