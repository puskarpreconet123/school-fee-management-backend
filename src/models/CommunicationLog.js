const mongoose = require('mongoose');

const communicationLogSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  channel: {
    type: String,
    enum: ['whatsapp', 'email', 'sms'],
    required: true
  },
  recipient: {
    type: String,
    required: true
  },
  payload: {
    type: mongoose.Schema.Types.Mixed
  },
  response: {
    type: mongoose.Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: ['success', 'failure'],
    required: true
  },
  error: {
    type: mongoose.Schema.Types.Mixed
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('CommunicationLog', communicationLogSchema);
