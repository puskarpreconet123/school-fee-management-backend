'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const paymentProviderSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['razorpay', 'phonepe'],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Encrypted provider-specific credentials
    config: {
      // Razorpay: { keyId, keySecret, webhookSecret }
      // PhonePe:  { merchantId, saltKey, saltIndex }
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { _id: false }
);

const schoolSchema = new mongoose.Schema(
  {
    schoolId: {
      type: String,
      unique: true,
      sparse: true,
    },
    name: {
      type: String,
      required: [true, 'School name is required'],
      trim: true,
      maxlength: 150,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false,
    },
    phone: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    paymentProviders: {
      type: [paymentProviderSchema],
      validate: {
        validator(providers) {
          if (!providers || providers.length === 0) return true;
          return providers.some((p) => p.isActive);
        },
        message: 'At least one payment provider must be active',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Per-channel credit balances. Email is free and not stored.
    creditBalances: {
      type: new mongoose.Schema(
        {
          sms: { type: Number, default: 0, min: 0 },
          whatsapp: { type: Number, default: 0, min: 0 },
          call: { type: Number, default: 0, min: 0 },
        },
        { _id: false }
      ),
      default: () => ({ sms: 0, whatsapp: 0, call: 0 }),
    },
    // Each rule: send `timesPerDay` reminders on the day that is `daysBefore` days before due date
    reminderRules: {
      type: [
        {
          daysBefore: {
            type: Number,
            required: true,
            min: [0, 'daysBefore must be >= 0'],
            max: [60, 'daysBefore cannot exceed 60'],
          },
          timesPerDay: {
            type: Number,
            required: true,
            min: [1, 'timesPerDay must be at least 1'],
            max: [5, 'timesPerDay cannot exceed 5'],
          },
          channels: {
            type: [String],
            enum: ['sms', 'whatsapp', 'call', 'email'],
            default: ['sms'],
            required: true,
          },
          _id: false,
        },
      ],
      default: [{ daysBefore: 3, timesPerDay: 1, channels: ['sms'] }],
      validate: {
        validator(rules) {
          if (!rules || rules.length === 0) return true;
          const days = rules.map((r) => r.daysBefore);
          return days.length === new Set(days).size; // no duplicate daysBefore
        },
        message: 'Each reminder rule must have a unique daysBefore value',
      },
    },
    // Custom template for reminder messages
    reminderMessageTemplate: {
      type: String,
      trim: true,
      default: 'Dear Parent, this is a reminder to pay the pending fee for your child.',
    },
    // Each rule: send `timesPerDay` reminders on the day that is `daysAfter` days past due date
    overdueRules: {
      type: [
        {
          daysAfter: {
            type: Number,
            required: true,
            min: [1, 'daysAfter must be >= 1'],
            max: [180, 'daysAfter cannot exceed 180'],
          },
          timesPerDay: {
            type: Number,
            required: true,
            min: [1, 'timesPerDay must be at least 1'],
            max: [5, 'timesPerDay cannot exceed 5'],
          },
          channels: {
            type: [String],
            enum: ['sms', 'whatsapp', 'call', 'email'],
            default: ['sms'],
            required: true,
          },
          _id: false,
        },
      ],
      default: [],
      validate: {
        validator(rules) {
          if (!rules || rules.length === 0) return true;
          const days = rules.map((r) => r.daysAfter);
          return days.length === new Set(days).size; // no duplicate daysAfter
        },
        message: 'Each overdue rule must have a unique daysAfter value',
      },
    },
    // School's own SMTP — if useCustom true, mails send from here;
    // otherwise the platform (superadmin) SMTP from .env is used.
    emailConfig: {
      type: {
        host: { type: String, trim: true },
        port: { type: Number, default: 587 },
        secure: { type: Boolean, default: false },
        user: { type: String, trim: true },
        pass: { type: String },
        from: { type: String, trim: true },
        useCustom: { type: Boolean, default: false },
      },
      default: null,
      _id: false,
    },

    whatsappConfig: {
      type: {
        apiUrl: { type: String, trim: true },
        channelId: { type: String, trim: true },
        apiKey: { type: String, trim: true },
        accessToken: { type: String, trim: true },
        wabaId: { type: String, trim: true },
        apiVersion: { type: String, trim: true },
        useCustom: { type: Boolean, default: false },
      },
      default: null,
      _id: false,
    },
    
    whatsappTemplates: {
      type: [
        {
          templateId: { type: String }, // External ID from Meta/Brandmo
          name: { type: String, required: true },
          category: { type: String, default: 'MARKETING' },
          language: { type: String, default: 'en' },
          header: {
            type: { type: String, enum: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'NONE'], default: 'NONE' },
            text: { type: String },
          },
          body: { type: String, required: true },
          footer: { type: String },
          buttons: { type: [mongoose.Schema.Types.Mixed] },
          status: { type: String, default: 'PENDING' },
        }
      ],
      default: []
    },

    // Repeats every N days after due date until paid or manually stopped
    overdueRepeatRule: {
      type: {
        intervalDays: {
          type: Number,
          required: true,
          min: [1, 'intervalDays must be >= 1'],
          max: [30, 'intervalDays cannot exceed 30'],
        },
        timesPerDay: {
          type: Number,
          required: true,
          min: [1, 'timesPerDay must be at least 1'],
          max: [5, 'timesPerDay cannot exceed 5'],
        },
        channels: {
          type: [String],
          enum: ['sms', 'whatsapp', 'call', 'email'],
          default: ['sms'],
        },
      },
      default: null,
      _id: false,
    },
    mustChangePassword: {
      type: Boolean,
      default: true,
    },
    tempPassword: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Pre-save: hash password & generate schoolId ───────────────────────────────
schoolSchema.pre('save', async function hashPwd(next) {
  if (!this.schoolId) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 6; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    this.schoolId = `SCH-${id}`;
  }
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Instance method: compare password ────────────────────────────────────────
schoolSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// ── Instance method: get active providers (safe — no secrets) ─────────────────
schoolSchema.methods.getActiveProviderTypes = function getActiveProviderTypes() {
  return this.paymentProviders
    .filter((p) => p.isActive)
    .map((p) => p.type);
};

// ── Instance method: get provider config by type ─────────────────────────────
schoolSchema.methods.getProviderConfig = function getProviderConfig(type) {
  const provider = this.paymentProviders.find((p) => p.type === type && p.isActive);
  if (!provider) throw new Error(`Provider "${type}" is not active for this school`);
  return provider.config;
};

module.exports = mongoose.model('School', schoolSchema);
