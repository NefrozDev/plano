import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { FriendsModule } from './friends/friends.module';
import { HealthModule } from './health/health.module';
import { GroupsModule } from './groups/groups.module';
import { ListsModule } from './lists/lists.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Per client IP, in memory: right for a single API instance. Sensitive
    // routes set stricter limits with @Throttle().
    ThrottlerModule.forRoot([{ ttl: 60 * 1000, limit: 300 }]),
    DatabaseModule,
    AuthModule,
    GroupsModule,
    FriendsModule,
    ListsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
