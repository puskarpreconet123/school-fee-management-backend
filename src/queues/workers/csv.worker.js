'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Worker } = require('bullmq');
const { createBullMQConnection } = require('../../config/redis');
const Student = require('../../models/Student');
const logger = require('../../utils/logger');

/**
 * Job data shape:
 *   { filePath, schoolId, uploadedBy }
 *
 * CSV must have columns: name, email, phone, class, section, rollNumber, parentName, parentPhone
 */
async function processCsvJob(job) {
  const { filePath, schoolId } = job.data;

  logger.info('Processing CSV job', { jobId: job.id, filePath, schoolId });

  const rows = await parseCsv(filePath);

  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const row of rows) {
    try {
      const studentData = sanitizeRow(row, schoolId);
      if (!studentData.name) {
        errors.push({ row, reason: 'Missing required field: name' });
        skipped++;
        continue;
      }

      // Upsert: update if same school + rollNumber, otherwise create
      await Student.findOneAndUpdate(
        { schoolId, rollNumber: studentData.rollNumber || undefined },
        { $setOnInsert: studentData },
        { upsert: true, new: false, setDefaultsOnInsert: true }
      );

      created++;
    } catch (err) {
      if (err.code === 11000) {
        skipped++;
      } else {
        errors.push({ row, reason: err.message });
        skipped++;
      }
    }
  }

  // Clean up temp file
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Best-effort cleanup
  }

  logger.info('CSV job completed', { jobId: job.id, created, skipped, errorCount: errors.length });

  return { created, skipped, errors };
}

function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv({ trim: true, skipEmptyLines: true }))
      .on('data', (row) => results.push(row))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

function sanitizeRow(row, schoolId) {
  return {
    schoolId,
    name: row.name?.trim() || row.Name?.trim(),
    email: row.email?.trim().toLowerCase() || row.Email?.trim().toLowerCase() || undefined,
    phone: row.phone?.trim() || row.Phone?.trim() || undefined,
    class: row.class?.trim() || row.Class?.trim() || undefined,
    section: row.section?.trim() || row.Section?.trim() || undefined,
    rollNumber: row.rollNumber?.trim() || row.roll_number?.trim() || undefined,
    parentName: row.parentName?.trim() || row.parent_name?.trim() || undefined,
    parentPhone: row.parentPhone?.trim() || row.parent_phone?.trim() || undefined,
    // Default password = phone or roll number (student must reset on first login)
    password: row.phone?.trim() || row.rollNumber?.trim() || undefined,
    tempPassword: row.phone?.trim() || row.rollNumber?.trim() || undefined,
  };
}

function startCsvWorker() {
  const worker = new Worker('csv-processing', processCsvJob, {
    connection: createBullMQConnection(),
    concurrency: 2, // Limited I/O concurrency
  });

  worker.on('completed', (job, result) => {
    logger.info('CSV worker completed', { jobId: job.id, result });
  });

  worker.on('failed', (job, err) => {
    logger.error('CSV worker failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}

module.exports = { startCsvWorker };
