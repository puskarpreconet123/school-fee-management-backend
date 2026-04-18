'use strict';

const { Worker } = require('bullmq');
const { createBullMQConnection } = require('../../config/redis');
const { sendMail } = require('../../utils/mailer');
const logger = require('../../utils/logger');

/**
 * Communicate worker — processes bulk SMS / WhatsApp / Call jobs.
 *
 * Each job payload:
 *   { channel, message, schoolId, students: [{ id, name, phone }] }
 *
 * TODO: integrate a messaging provider (e.g. MSG91, Twilio, Kaleyra)
 * and replace the stub below with real API calls.
 */
function startCommunicateWorker() {
  const worker = new Worker(
    'communicate',
    async (job) => {
      const { channel, message, schoolId, students } = job.data;

      logger.info('Processing communicate job', {
        jobId: job.id,
        channel,
        schoolId,
        recipientCount: students.length,
      });

      for (const student of students) {
        try {
          if (channel === 'email') {
            if (!student.email) {
              logger.warn('Student has no email, skipping', { studentId: student.id });
              continue;
            }
            await sendMail({
              to: student.email,
              subject: `Message from your school`,
              text: message,
            });
            logger.info('Email sent to student', { studentId: student.id, to: student.email });
          } else {
            // STUB for SMS / WhatsApp / Call — replace with real provider (MSG91, Twilio, etc.)
            logger.info(`[STUB] ${channel.toUpperCase()} sent`, {
              to: student.phone,
              name: student.name,
              preview: message.slice(0, 40),
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
