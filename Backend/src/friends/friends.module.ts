import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { GroupsModule } from '../groups/groups.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { Friendship } from './friendship.entity';

/** Friend requests and friendships, and the contacts they form with group mates. */
@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    GroupsModule,
    TypeOrmModule.forFeature([Friendship]),
  ],
  controllers: [FriendsController, ContactsController],
  providers: [FriendsService, ContactsService],
  exports: [ContactsService],
})
export class FriendsModule {}
