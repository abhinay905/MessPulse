/**
 * container.ts — composition root.
 * ALL concrete class construction and wiring happens here.
 * Services receive ports via constructor injection; no DI framework.
 * DOC3 §3.1: only container.ts constructs concrete classes.
 */

import Redis from 'ioredis';
import { config } from './config';
import { SwitchableClock } from './infra/clock';
import { EventBus } from './infra/event-bus';
import { MongoUserRepository } from './infra/mongo/user.repository';
import { MongoMealRepository } from './infra/mongo/meal.repository';
import { RedisOtpStore } from './infra/redis/otp-store.redis';
import { InMemoryOtpStore } from './infra/memory/otp-store.memory';
import { RedisCameraReadingStore } from './infra/redis/camera-reading-store.redis';
import { InMemoryCameraReadingStore } from './infra/memory/camera-reading-store.memory';
import { RedisEntryVelocityStore } from './infra/redis/entry-velocity-store.redis';
import { InMemoryEntryVelocityStore } from './infra/memory/entry-velocity-store.memory';
import { ConsoleMailer } from './infra/mail/console.mailer';
import { ResendMailer } from './infra/mail/resend.mailer';
import type { Mailer } from './infra/mail/mailer.port';
import type {
  UserRepository,
  OtpStore,
  CameraReadingStore,
  EntryVelocityStore,
  MealRepository,
} from './core/ports';
import { TokenService } from './modules/auth/token.service';
import { AuthService } from './modules/auth/auth.service';
import { createAuthMiddleware } from './modules/auth/auth.middleware';
import { IngestService } from './modules/ingest/ingest.service';

export interface Container {
  clock: SwitchableClock;
  eventBus: EventBus;
  userRepo: UserRepository;
  mealRepo: MealRepository;
  otpStore: OtpStore;
  cameraStore: CameraReadingStore;
  velocityStore: EntryVelocityStore;
  mailer: Mailer;
  tokenService: TokenService;
  authService: AuthService;
  authMiddleware: ReturnType<typeof createAuthMiddleware>;
  ingestService: IngestService;
  redis?: Redis | undefined;
}

export interface ContainerOverrides {
  clock?: SwitchableClock | undefined;
  eventBus?: EventBus | undefined;
  userRepo?: UserRepository | undefined;
  mealRepo?: MealRepository | undefined;
  otpStore?: OtpStore | undefined;
  cameraStore?: CameraReadingStore | undefined;
  velocityStore?: EntryVelocityStore | undefined;
  mailer?: Mailer | undefined;
  tokenService?: TokenService | undefined;
  authService?: AuthService | undefined;
  ingestService?: IngestService | undefined;
  redis?: Redis | undefined;
}

export function buildContainer(overrides: ContainerOverrides = {}): Container {
  const clock = overrides.clock ?? new SwitchableClock();
  const eventBus = overrides.eventBus ?? new EventBus();

  let redis: Redis | undefined = overrides.redis;

  // OtpStore
  let otpStore: OtpStore;
  if (overrides.otpStore) {
    otpStore = overrides.otpStore;
  } else if (process.env.NODE_ENV === 'test' && !process.env.USE_REDIS_IN_TESTS) {
    otpStore = new InMemoryOtpStore();
  } else {
    redis = redis ?? new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    otpStore = new RedisOtpStore(redis);
  }

  // CameraReadingStore
  let cameraStore: CameraReadingStore;
  if (overrides.cameraStore) {
    cameraStore = overrides.cameraStore;
  } else if (process.env.NODE_ENV === 'test' && !process.env.USE_REDIS_IN_TESTS) {
    cameraStore = new InMemoryCameraReadingStore();
  } else {
    redis = redis ?? new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    cameraStore = new RedisCameraReadingStore(redis);
  }

  // EntryVelocityStore
  let velocityStore: EntryVelocityStore;
  if (overrides.velocityStore) {
    velocityStore = overrides.velocityStore;
  } else if (process.env.NODE_ENV === 'test' && !process.env.USE_REDIS_IN_TESTS) {
    velocityStore = new InMemoryEntryVelocityStore();
  } else {
    redis = redis ?? new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    velocityStore = new RedisEntryVelocityStore(redis);
  }

  const userRepo = overrides.userRepo ?? new MongoUserRepository();
  const mealRepo = overrides.mealRepo ?? new MongoMealRepository();

  let mailer: Mailer;
  if (overrides.mailer) {
    mailer = overrides.mailer;
  } else if (config.MAILER_PROVIDER === 'resend' && config.RESEND_API_KEY) {
    mailer = new ResendMailer(config.RESEND_API_KEY);
  } else {
    mailer = new ConsoleMailer();
  }

  const tokenService = overrides.tokenService ?? new TokenService(config.JWT_SECRET);

  const allowedDomains = config.OTP_ALLOWED_DOMAINS
    ? config.OTP_ALLOWED_DOMAINS.split(',').map((d) => d.trim()).filter((d) => d.length > 0)
    : [];

  const authService =
    overrides.authService ??
    new AuthService(otpStore, userRepo, mailer, tokenService, {
      otpSecret: config.JWT_SECRET,
      allowedDomains,
    });

  const authMiddleware = createAuthMiddleware(tokenService, config.INGEST_KEY);

  const ingestService =
    overrides.ingestService ??
    new IngestService(cameraStore, velocityStore, mealRepo, eventBus);

  return {
    clock,
    eventBus,
    userRepo,
    mealRepo,
    otpStore,
    cameraStore,
    velocityStore,
    mailer,
    tokenService,
    authService,
    authMiddleware,
    ingestService,
    redis,
  };
}
