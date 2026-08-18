import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { GroupMembership } from './group-membership.entity';
import { Group } from './group.entity';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    TypeOrmModule.forFeature([Group, GroupMembership]),
  ],
  controllers: [GroupsController],
  providers: [GroupsService],
})
export class GroupsModule {}
