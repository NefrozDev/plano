import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { DatabaseWriteLockService } from './database-write-lock.service';
import { CreateAuthTables1786940000000 } from './migrations/1786940000000-create-auth-tables';
import { CreateGroupTables1787020000000 } from './migrations/1787020000000-create-group-tables';

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
