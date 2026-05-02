'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const School = require('../src/models/School');
const Student = require('../src/models/Student');
const Fee = require('../src/models/Fee');
const { FeeStatus } = require('../src/models/Fee');
const Payment = require('../src/models/Payment');

const DEMO_EMAIL_DOMAIN = 'demo-platform.test';
const DEMO_SCHOOL_REGEX = new RegExp(`@${DEMO_EMAIL_DOMAIN}$`);

const SCHOOL_NAMES = [
  'Greenwood International',
  'St. Xavier Public School',
  'Lotus Valley Academy',
  'Riverside High',
  'Crescent Hills School',
  'Maple Leaf Academy',
  'Bluebell Convent',
  'Silverline Public School',
  'Heritage Global School',
  'Sunrise Vidyalaya',
  'Northstar Academy',
  'Oakridge International',
];

const FIRST_NAMES = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Sai', 'Rohan', 'Krishna', 'Ishaan', 'Diya', 'Ananya', 'Aanya', 'Saanvi', 'Anika', 'Myra', 'Pari'];
const LAST_NAMES = ['Sharma', 'Verma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Mehta', 'Reddy', 'Iyer', 'Joshi'];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function cleanup() {
  console.log('Cleaning up old demo data...');
  const schools = await School.find({ email: DEMO_SCHOOL_REGEX }).select('_id');
  const ids = schools.map((s) => s._id);
  if (ids.length === 0) {
    console.log('  no prior demo data found.');
    return;
  }
  const [s, st, f, p] = await Promise.all([
    School.deleteMany({ _id: { $in: ids } }),
    Student.deleteMany({ schoolId: { $in: ids } }),
    Fee.deleteMany({ schoolId: { $in: ids } }),
    Payment.deleteMany({ schoolId: { $in: ids } }),
  ]);
  console.log(`  removed ${s.deletedCount} schools, ${st.deletedCount} students, ${f.deletedCount} fees, ${p.deletedCount} payments.`);
}

async function createSchools() {
  console.log('Creating demo schools...');
  const created = [];

  // Distribution: how many schools joined each month (going back from today).
  // Index 0 = current month, 11 = 11 months ago. Mimics gradual platform growth.
  const monthlyJoins = [3, 2, 2, 1, 2, 1, 1, 2, 1, 1, 1, 1]; // total = 18 schools

  let nameIdx = 0;
  let i = 0;

  for (let monthsAgo = 0; monthsAgo < monthlyJoins.length; monthsAgo++) {
    const joinsThisMonth = monthlyJoins[monthsAgo];

    for (let k = 0; k < joinsThisMonth; k++) {
      const name = SCHOOL_NAMES[nameIdx % SCHOOL_NAMES.length] +
        (nameIdx >= SCHOOL_NAMES.length ? ` ${Math.floor(nameIdx / SCHOOL_NAMES.length) + 1}` : '');
      nameIdx++;

      const createdAt = new Date();
      createdAt.setMonth(createdAt.getMonth() - monthsAgo);
      createdAt.setDate(randInt(1, 28));
      createdAt.setHours(randInt(0, 23), randInt(0, 59));

      // 1 in ~6 schools inactive
      const isActive = i % 6 !== 0 || i === 0;

      const school = await School.create({
        name,
        email: `school${i + 1}@${DEMO_EMAIL_DOMAIN}`,
        password: 'demo1234',
        phone: `9${randInt(100000000, 999999999)}`,
        address: `${randInt(1, 200)} Demo Lane, City ${i + 1}`,
        isActive,
        creditBalances: {
          sms: randInt(20, 200),
          whatsapp: randInt(10, 100),
          call: randInt(5, 50),
        },
        paymentProviders: [
          {
            type: 'razorpay',
            isActive: true,
            config: {
              keyId: `rzp_test_demo_${i}`,
              keySecret: 'demo_secret',
              webhookSecret: 'demo_webhook_secret',
            },
          },
        ],
      });

      // Backdate createdAt. We use the raw collection driver because Mongoose
      // marks createdAt as immutable by default — School.updateOne(...) silently no-ops.
      await School.collection.updateOne(
        { _id: school._id },
        { $set: { createdAt } }
      );

      created.push({ ...school.toObject(), createdAt, isActive });
      console.log(`  + ${name} (${isActive ? 'active' : 'inactive'}, joined ${createdAt.toISOString().slice(0, 10)})`);
      i++;
    }
  }

  return created;
}

async function createStudentsAndFees(schools) {
  console.log('Creating students, fees, and payments...');

  let totalStudents = 0;
  let totalFees = 0;
  let totalPayments = 0;

  for (let s = 0; s < schools.length; s++) {
    const school = schools[s];
    // Bigger schools get more students → more revenue → leaderboard variety
    const studentCount = randInt(10, 25) + (s < 4 ? 15 : 0);
    const students = [];

    for (let i = 0; i < studentCount; i++) {
      students.push({
        schoolId: school._id,
        name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        email: `s${s}-${i}@${DEMO_EMAIL_DOMAIN}`,
        class: String(randInt(1, 12)),
        section: pick(['A', 'B', 'C']),
        rollNumber: `R${1000 + s * 100 + i}`,
        parentName: `Parent ${i + 1}`,
        parentPhone: `9${randInt(100000000, 999999999)}`,
        isActive: true,
      });
    }

    const createdStudents = await Student.insertMany(students);
    totalStudents += createdStudents.length;

    // Tiered fee amounts so leaderboard isn't flat
    const baseAmount = [8000, 6500, 5500, 5000, 4500, 4000, 3500, 3000, 2800, 2500, 2200, 2000][s] || 2500;

    const fees = [];
    const payments = [];

    for (const student of createdStudents) {
      // 6 monthly fees per student (last 6 months)
      for (let m = 0; m < 6; m++) {
        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() - m);
        dueDate.setDate(15);

        // Status mix:
        //  - older months: ~85% paid
        //  - current month: ~50% paid
        const paidProb = m === 0 ? 0.5 : 0.85;
        const isPaid = Math.random() < paidProb;
        const isOverdue = !isPaid && dueDate < new Date() && Math.random() < 0.4;

        const amount = baseAmount + randInt(-300, 300);

        let paidAt = null;
        let status = FeeStatus.UNPAID;

        if (isPaid) {
          status = FeeStatus.PAID;
          paidAt = new Date(dueDate);
          paidAt.setDate(paidAt.getDate() + randInt(-5, 5));
          // Some payments in the last 30 days for the volume chart
          if (m === 0 && Math.random() < 0.7) {
            paidAt = daysAgo(randInt(0, 29));
          }
        } else if (isOverdue) {
          status = FeeStatus.OVERDUE;
        }

        const feeId = new mongoose.Types.ObjectId();
        fees.push({
          _id: feeId,
          schoolId: school._id,
          studentId: student._id,
          title: `Monthly Fee - ${dueDate.toLocaleString('default', { month: 'long' })} ${dueDate.getFullYear()}`,
          amount,
          amountInPaise: amount * 100,
          dueDate,
          status,
          paidAt,
          paidAmount: isPaid ? amount : 0,
        });

        if (isPaid) {
          payments.push({
            schoolId: school._id,
            studentId: student._id,
            feeId,
            amount,
            amountInPaise: amount * 100,
            currency: 'INR',
            provider: 'razorpay',
            providerOrderId: `order_demo_${feeId.toString().slice(-8)}`,
            providerPaymentId: `pay_demo_${feeId.toString().slice(-8)}`,
            status: 'SUCCESS',
            completedAt: paidAt,
            attempts: [
              {
                provider: 'razorpay',
                providerOrderId: `order_demo_${feeId.toString().slice(-8)}`,
                providerPaymentId: `pay_demo_${feeId.toString().slice(-8)}`,
                status: 'SUCCESS',
                attemptedAt: paidAt,
              },
            ],
          });
        }
      }
    }

    if (fees.length) await Fee.insertMany(fees);
    if (payments.length) await Payment.insertMany(payments);

    totalFees += fees.length;
    totalPayments += payments.length;

    console.log(`  ${school.name}: ${createdStudents.length} students, ${fees.length} fees, ${payments.length} payments`);
  }

  return { totalStudents, totalFees, totalPayments };
}

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is missing from .env');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.\n');

  try {
    await cleanup();
    console.log();
    const schools = await createSchools();
    console.log();
    const stats = await createStudentsAndFees(schools);
    console.log('\n─── Seeding summary ───');
    console.log(`Schools:  ${schools.length} (${schools.filter((s) => s.isActive).length} active, ${schools.filter((s) => !s.isActive).length} inactive)`);
    console.log(`Students: ${stats.totalStudents}`);
    console.log(`Fees:     ${stats.totalFees}`);
    console.log(`Payments: ${stats.totalPayments}`);
    console.log('\nLog into the superadmin dashboard and open Analytics — all four charts should now render.');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('\nSeed failed:', err);
  process.exit(1);
});
