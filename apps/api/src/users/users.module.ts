import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';
import { AvatarsController } from './avatars.controller';
import { ProfileController } from './profile.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuditModule, MediaModule],
  controllers: [ProfileController, UsersController, AvatarsController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
