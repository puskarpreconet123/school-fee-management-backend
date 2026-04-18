'use strict';

const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Notice title is required'],
      trim: true,
      maxlength: 200,
    },
    content: {
      type: String,
      required: [true, 'Notice content is required'],
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    targetClasses: {
      type: [String],
      default: [],
      // If empty, it means 'All Classes'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School', // In this system, the "Admin" is the School entity
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Notice', noticeSchema);
