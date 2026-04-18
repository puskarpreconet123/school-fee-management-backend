'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const School = require('../src/models/School');

async function seed() {
  console.log('Connecting to database...');
  await mongoose.connect(process.env.MONGO_URI);

  const email = 'admin@school.edu';
  const password = 'school123';
  const name = 'Sample Excellence School';

  const existing = await School.findOne({ email });
  if (existing) {
    console.log('School account already exists:', email);
  } else {
    await School.create({
      name,
      email,
      password,
      phone: '9876543210',
      address: '123 Education Lane, Knowledge City',
      paymentProviders: [
        {
          type: 'razorpay',
          isActive: true,
          config: {
            keyId: 'rzp_test_sample',
            keySecret: 'sample_secret_key',
            webhookSecret: 'sample_webhook_secret'
          }
        }
      ]
    });
    console.log('School account created successfully!');
    console.log('Email:', email);
    console.log('Password:', password);
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Error seeding school:', err);
  process.exit(1);
});
