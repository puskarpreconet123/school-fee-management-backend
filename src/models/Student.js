'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const studentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: [true, 'schoolId is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Student name is required'],
      trim: true,
      maxlength: 150,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    phone: {
      type: String,
      trim: true,
    },
    password: {
      type: String,
      minlength: 6,
      select: false,
    },
    rollNumber: {
      type: String,
      trim: true,
    },
    class: {
      type: String,
      trim: true,
    },
    section: {
      type: String,
      trim: true,
      uppercase: true,
    },
    parentName: {
      type: String,
      trim: true,
    },
    parentPhone: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    mustChangePassword: {
      type: Boolean,
      default: true,
    },
    studentId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true, // allows null during migration of existing records
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

// ── Compound unique index: rollNumber scoped to school ────────────────────────
studentSchema.index({ schoolId: 1, rollNumber: 1 }, { unique: true, sparse: true });
studentSchema.index({ schoolId: 1, email: 1 }, { unique: true, sparse: true });

// ── Pre-save: hash password ───────────────────────────────────────────────────
studentSchema.pre('save', async function hashPwd(next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Instance method: compare password ────────────────────────────────────────
studentSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('Student', studentSchema);
