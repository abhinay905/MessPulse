/**
 * scripts/seed.ts — idempotent database seeder for MessPulse.
 * DOC4 Step 5.
 *
 * Seeds:
 * - Default MessSettings
 * - Today's lunch + dinner meals
 * - Staff and Admin users (bcrypt hashed PIN)
 *
 * Idempotent: safe to run multiple times with zero duplicates.
 */

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectMongo, disconnectMongo } from '../src/infra/mongo/connection';
import { MealModel } from '../src/infra/mongo/models/meal.model';
import { MessSettingsModel } from '../src/infra/mongo/models/mess-settings.model';
import { UserModel } from '../src/infra/mongo/models/user.model';

export async function seed(): Promise<void> {
  await connectMongo();

  const messIds = Array.from(new Set([process.env.DEFAULT_MESS_ID || 'mess-main-hall', 'hostel-mess-1']));

  // 1. Seed Default MessSettings for all messIds
  for (const messId of messIds) {
    await MessSettingsModel.findOneAndUpdate(
      { messId },
      {
        $set: {
          messId,
          name: messId === 'mess-main-hall' ? 'Main Dining Hall' : 'Hostel Main Mess',
          seatCapacity: 200,
          servicePerMin: 15,
          geofence: {
            lat: 12.9716,
            lng: 77.5946,
            radiusM: 100,
          },
          baseMealMin: 18,
          maxSessionMin: 60,
          decay: {
            tail: [
              { untilOffsetMin: 8, weight: 0.6 },
              { untilOffsetMin: 17, weight: 0.25 },
            ],
          },
          staleCameraSec: 30,
          alertThresholds: {
            warnRatio: 0.85,
            clearRatio: 0.7,
            horizonMin: 10,
          },
        },
      },
      { upsert: true, new: true }
    );
  }

  // 2. Seed Staff and Admin users
  const staffPin = process.env.STAFF_DEFAULT_PIN || '1234';
  const adminPin = process.env.ADMIN_DEFAULT_PIN || '4321';

  const staffPinHash = bcrypt.hashSync(staffPin, 10);
  const adminPinHash = bcrypt.hashSync(adminPin, 10);

  await UserModel.findOneAndUpdate(
    { email: 'staff@messpulse.internal' },
    {
      $set: {
        email: 'staff@messpulse.internal',
        name: 'Staff Lead',
        role: 'staff',
        pinHash: staffPinHash,
      },
    },
    { upsert: true, new: true }
  );

  await UserModel.findOneAndUpdate(
    { email: 'admin@messpulse.internal' },
    {
      $set: {
        email: 'admin@messpulse.internal',
        name: 'Mess Admin',
        role: 'admin',
        pinHash: adminPinHash,
      },
    },
    { upsert: true, new: true }
  );

  // 3. Seed Today's Lunch and Dinner for each mess
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  const lunchStart = new Date(year, now.getMonth(), now.getDate(), 12, 0, 0).getTime();
  const lunchEnd = new Date(year, now.getMonth(), now.getDate(), 14, 30, 0).getTime();

  const dinnerStart = new Date(year, now.getMonth(), now.getDate(), 19, 30, 0).getTime();
  const dinnerEnd = new Date(year, now.getMonth(), now.getDate(), 22, 0, 0).getTime();

  for (const messId of messIds) {
    await MealModel.findOneAndUpdate(
      { messId, mealId: `${dateStr}-lunch` },
      {
        $set: {
          messId,
          mealId: `${dateStr}-lunch`,
          type: 'lunch',
          startsAt: lunchStart,
          endsAt: lunchEnd,
          menuItems: ['Dal Tadka', 'Jeera Rice', 'Paneer Butter Masala', 'Roti', 'Salad'],
          menuDemandFactorMin: 2,
          trayCapacity: 400,
        },
      },
      { upsert: true, new: true }
    );

    await MealModel.findOneAndUpdate(
      { messId, mealId: `${dateStr}-dinner` },
      {
        $set: {
          messId,
          mealId: `${dateStr}-dinner`,
          type: 'dinner',
          startsAt: dinnerStart,
          endsAt: dinnerEnd,
          menuItems: ['Mix Veg', 'Steamed Rice', 'Dal Fry', 'Roti', 'Gulab Jamun'],
          menuDemandFactorMin: 1,
          trayCapacity: 400,
        },
      },
      { upsert: true, new: true }
    );
  }
}

// Execute directly if run as a script
if (require.main === module) {
  seed()
    .then(async () => {
      console.log('Seed completed successfully.');
      await disconnectMongo();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Seed failed:', err);
      await disconnectMongo();
      process.exit(1);
    });
}
