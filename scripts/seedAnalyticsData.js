'use strict';

const mongoose = require('mongoose');
require('dotenv').config();
const School = require('../src/models/School');
const Student = require('../src/models/Student');
const Fee = require('../src/models/Fee');
const { FeeStatus } = require('../src/models/Fee');

const SCHOOL_ID = '69dcb6bff0385e2657052da9';

async function seed() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected.');

    const school = await School.findById(SCHOOL_ID);
    if (!school) {
      console.error('School not found.');
      process.exit(1);
    }

    // 1. Clear existing dummy students for this school
    console.log('Cleaning up old dummy data...');
    const delResult = await Student.deleteMany({ schoolId: SCHOOL_ID, email: /\.dummy@fs\.com$/ });
    console.log(`Deleted ${delResult.deletedCount} old dummy students.`);
    
    // Also delete associated fees to avoid orphans
    await Fee.deleteMany({ schoolId: SCHOOL_ID, title: /Monthly Tuition/ });

    console.log('Adding 20 students...');
    const classes = ['5', '6', '7', '8'];
    const sections = ['A', 'B'];
    const students = [];

    for (let i = 1; i <= 20; i++) {
      const cls = classes[Math.floor((i - 1) / 5)];
      const sec = sections[i % 2];
      
      students.push({
        schoolId: SCHOOL_ID,
        name: `Student ${i}`,
        email: `stu.${Date.now()}.${i}.dummy@fs.com`,
        class: cls,
        section: sec,
        rollNumber: `R${100 + i}`,
        parentName: `Parent ${i}`,
        parentPhone: `99999900${i.toString().padStart(2, '0')}`,
        isActive: true,
        password: 'password123'
      });
    }

    const createdStudents = await Student.insertMany(students);
    console.log(`${createdStudents.length} students created.`);

    // 2. Add Fees and Payments
    console.log('Creating fee records and collection trends...');
    const feeRecords = [];
    const now = new Date();

    for (const student of createdStudents) {
      // Create 3 fee records per student
      for (let j = 0; j < 3; j++) {
        const monthOffset = j; // This month, last month, month before last
        const dueDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 15);
        
        let status = FeeStatus.PAID;
        let paidAt = null;

        // Distribute statuses
        const rand = Math.random();
        if (rand > 0.7) {
          status = FeeStatus.UNPAID;
        } else if (rand > 0.85) {
          status = FeeStatus.OVERDUE;
        } else {
          status = FeeStatus.PAID;
          paidAt = new Date(dueDate);
          paidAt.setDate(paidAt.getDate() - Math.floor(Math.random() * 5)); // Paid a few days before due
        }

        feeRecords.push({
          schoolId: SCHOOL_ID,
          studentId: student._id,
          title: `Monthly Tuition - ${dueDate.toLocaleString('default', { month: 'long' })}`,
          amount: 2500,
          status,
          dueDate,
          paidAt
        });
      }
    }

    await Fee.insertMany(feeRecords);
    console.log(`${feeRecords.length} fee records created.`);

    console.log('Seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error during seeding:', err);
    process.exit(1);
  }
}

seed();
