import { Controller, Get, UseGuards } from '@nestjs/common';
import type { Contact } from '@plano/common';
import { AllowedOriginGuard } from '../auth/allowed-origin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ContactsService } from './contacts.service';

@Controller('contacts')
@UseGuards(AllowedOriginGuard, SessionAuthGuard)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  findAll(@CurrentUser('id') userId: string): Promise<Contact[]> {
    return this.contacts.findAll(userId);
  }
}
