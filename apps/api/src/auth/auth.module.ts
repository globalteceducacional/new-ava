import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { InstitutionScopeGuard } from './guards/institution-scope.guard';
import { RolesGuard } from './guards/roles.guard';
import { resolveJwtSecret } from './jwt-secret.util';
import { LoginProtectionService } from './login-protection.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSecret(config),
        signOptions: {
          expiresIn: (config.get<string>('JWT_ACCESS_EXPIRES_IN') ??
            '15m') as `${number}m`,
        },
      }),
    }),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RolesGuard,
    InstitutionScopeGuard,
    LoginProtectionService,
  ],
  exports: [AuthService, JwtModule, RolesGuard, InstitutionScopeGuard],
})
export class AuthModule {}
