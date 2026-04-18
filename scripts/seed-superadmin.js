'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const SuperAdmin = require('../src/models/SuperAdmin');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);

  const email = process.env.SUPER_ADMIN_EMAIL || 'superadmin@feesync.com';
  const password = process.env.SUPER_ADMIN_PASSWORD || 'superadmin123';
  const name = process.env.SUPER_ADMIN_NAME || 'Super Admin';

  const existing = await SuperAdmin.findOne({ email });
  if (existing) {
    console.log('Super admin already exists:', email);
  } else {
    await SuperAdmin.create({ name, email, password });
    console.log('Super admin created:', email);
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
