/**
 * scripts/print-checkin-url.ts — prints a check-in URL with a signed token for the current meal.
 * DOC4 Step 9.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/print-checkin-url.ts
 *   npm run print-checkin-url
 */

import path from 'path';
import { connectMongo, disconnectMongo } from '../src/infra/mongo/connection';
import { MealModel } from '../src/infra/mongo/models/meal.model';
import { signMealToken } from '../src/modules/sessions/meal-token';

if (typeof process.loadEnvFile === 'function') {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../.env'),
  ];
  for (const envPath of candidates) {
    try {
      process.loadEnvFile(envPath);
    } catch {
      // ignore
    }
  }
}

export async function printCheckInUrl(): Promise<string> {
  const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/messpulse';
  await connectMongo(mongoUrl);

  const messId = process.env.DEFAULT_MESS_ID || 'mess-main-hall';
  const now = Date.now();

  // 1. Find active meal; if none, find the nearest upcoming/recent meal
  let meal = await MealModel.findOne({
    messId,
    startsAt: { $lte: now },
    endsAt: { $gte: now },
  });

  if (!meal) {
    meal = await MealModel.findOne({ messId }).sort({ startsAt: -1 });
  }

  if (!meal) {
    // If not found under defaultMessId, try hostel-mess-1 fallback
    meal = await MealModel.findOne().sort({ startsAt: -1 });
  }

  if (!meal) {
    console.error(`No meals found in database. Run 'npm run seed' first.`);
    await disconnectMongo();
    process.exit(1);
  }

  const jwtSecret = process.env.JWT_SECRET || 'test-jwt-secret-min-16-characters-long';
  const webUrl = process.env.WEB_URL || 'http://localhost:5173';

  // Calculate remaining meal duration or default to 2 hours
  const remainingSec = Math.max(300, Math.round((meal.endsAt - now) / 1000));
  const token = signMealToken({ messId: meal.messId, mealId: meal.mealId }, jwtSecret, remainingSec);
  const checkInUrl = `${webUrl}/student/checkin?t=${token}`;

  console.log('\n======================================================');
  console.log('           MessPulse — Active Meal Check-In QR        ');
  console.log('======================================================');
  console.log(`Mess ID:       ${meal.messId}`);
  console.log(`Meal ID:       ${meal.mealId} (${meal.type})`);
  console.log(`Starts At:     ${new Date(meal.startsAt).toLocaleTimeString()}`);
  console.log(`Ends At:       ${new Date(meal.endsAt).toLocaleTimeString()}`);
  console.log(`Expires In:    ${Math.round(remainingSec / 60)} minutes`);
  console.log('------------------------------------------------------');
  console.log('Token:');
  console.log(token);
  console.log('------------------------------------------------------');
  console.log('Check-In URL (open on student device):');
  console.log(checkInUrl);
  console.log('======================================================\n');

  await disconnectMongo();
  return checkInUrl;
}

if (require.main === module) {
  printCheckInUrl().catch((err) => {
    console.error('Error generating check-in URL:', err);
    process.exit(1);
  });
}
