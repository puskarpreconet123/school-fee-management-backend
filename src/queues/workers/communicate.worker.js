'use strict';

const { Worker } = require('bullmq');
const { createBullMQConnection } = require('../../config/redis');
const { env } = require('../../config/env');
const { sendMailFromSchool } = require('../../utils/mailer');
const { sendWhatsappFromSchool } = require('../../utils/whatsapp');
const logger = require('../../utils/logger');

/**
 * Communicate worker — processes bulk message jobs.
 *
 * Each job payload:
 *   { channel, message, schoolId, students: [{ id, name, email?, phone? }] }
 *
 * Email uses the school's custom SMTP if configured (useCustom: true),
 * otherwise falls back to the platform SMTP.
 */
function startCommunicateWorker() {
  const worker = new Worker(
    'communicate',
    async (job) => {
      const { channel, message, schoolId, students } = job.data;

      logger.info('Processing communicate job', {
        jobId: job.id, channel, schoolId, recipientCount: students.length,
      });

      // Load school once for config resolution
      let school = null;
      if (['email', 'whatsapp'].includes(channel) && schoolId) {
        const School = require('../../models/School');
        school = await School.findById(schoolId).select('name emailConfig whatsappConfig');
      }

      for (const student of students) {
        try {
          // ── Variable Replacement ──
          const paymentLink = `${env.urls.frontend}/pay?studentId=${student.id}`;
          const dueDateStr = student.dueDate ? new Date(student.dueDate).toLocaleDateString('en-IN') : 'N/A';
          const amountDueStr = `₹${student.amountDue || 0}`;
          const urgencyLine = student.amountDue > 0 ? 'Please clear your pending dues.' : '';

          const personalizedMsg = message
            .replace(/{student_name}/g, student.name)
            .replace(/{amount_due}/g, amountDueStr)
            .replace(/{school_name}/g, job.data.schoolName || 'School')
            .replace(/{due_date}/g, dueDateStr)
            .replace(/{payment_link}/g, paymentLink)
            .replace(/{urgency_line}/g, urgencyLine);

          if (channel === 'email') {
            if (!student.email) {
              logger.warn('Student has no email, skipping', { studentId: student.id });
              continue;
            }
            await sendMailFromSchool(school, {
              to:      student.email,
              subject: `Message from ${school?.name || 'your school'}`,
              text:    personalizedMsg,
            });
            logger.info('Email sent to student', { studentId: student.id, to: student.email });
          } else if (channel === 'whatsapp') {
            if (!student.phone) {
              logger.warn('Student has no phone number, skipping', { studentId: student.id });
              continue;
            }
            await sendWhatsappFromSchool(school, {
              to: student.phone,
              message: personalizedMsg,
              studentName: student.name
            });
            logger.info('WhatsApp sent to student', { studentId: student.id, to: student.phone });
          } else {
            // STUB for SMS / Call
            logger.info(`[STUB] ${channel.toUpperCase()} sent`, {
              to:      student.phone,
              name:    student.name,
              preview: personalizedMsg.slice(0, 40),
            });
          }
        } catch (err) {
          logger.error(`Failed to send ${channel} to student`, {
            studentId: student.id,
            error: err.message,
          });
          // Continue with remaining recipients even if one fails
        }
      }

      logger.info('Communicate job completed', { jobId: job.id, channel, count: students.length });
    },
    {
      connection: createBullMQConnection(),
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error('Communicate job failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}

module.exports = { startCommunicateWorker };
