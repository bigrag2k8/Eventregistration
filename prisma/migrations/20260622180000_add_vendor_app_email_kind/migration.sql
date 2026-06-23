-- Add a new EmailKind value so the organizer-facing "new vendor application"
-- notification is loggable in EmailLog like every other transactional email.
-- ALTER TYPE … ADD VALUE in Postgres has to run outside a transaction; Prisma
-- migrate handles that by splitting each ALTER into its own statement.
ALTER TYPE "EmailKind" ADD VALUE 'VENDOR_APPLICATION_RECEIVED';
