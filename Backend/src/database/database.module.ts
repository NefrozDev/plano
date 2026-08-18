import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { DatabaseWriteLockService } from './database-write-lock.service';
import { CreateAuthTables1786940000000 } from './migrations/1786940000000-create-auth-tables';
import { CreateGroupTables1787020000000 } from './migrations/1787020000000-create-group-tables';

function resolveDatabasePath(configuredPath: string): string {
  if (isAbsolute(configuredPath)) {
    return configuredPath;
  }

  // __dirname is Backend/src/database in tests and Backend/dist/database at runtime.
  return resolve(__dirname, '..', '..', configuredPath);
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const location = resolveDatabasePath(
          config.get<string>('DATABASE_PATH') ?? 'data/plano.sqlite',
        );

        await mkdir(dirname(location), { recursive: true });

        return {
          type: 'sqljs' as const,
          location,
          autoLoadEntities: true,
          autoSave: true,
          migrations: [
            CreateAuthTables1786940000000,
            CreateGroupTables1787020000000,
          ],
          migrationsRun: true,
          synchronize: false,
        };
      },
    }),
  ],
  providers: [DatabaseWriteLockService],
  exports: [DatabaseWriteLockService],
})
export class DatabaseModule {}
