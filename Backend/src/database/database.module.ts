import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { DatabaseWriteLockService } from './database-write-lock.service';
import { MIGRATIONS } from './migrations';

/**
 * The Backend folder: the nearest parent with a package.json. __dirname is
 * Backend/src/database in tests but Backend/dist/Backend/src/database once
 * built, so a fixed number of `..` would not fit both.
 */
function backendRoot(): string {
  let directory = __dirname;
  while (!existsSync(join(directory, 'package.json'))) {
    directory = dirname(directory);
  }
  return directory;
}

function resolveDatabasePath(configuredPath: string): string {
  return isAbsolute(configuredPath)
    ? configuredPath
    : resolve(backendRoot(), configuredPath);
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
          migrations: MIGRATIONS,
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
