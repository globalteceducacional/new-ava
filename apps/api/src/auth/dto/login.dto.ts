import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** E-mail ou username */
  @IsString()
  @IsNotEmpty()
  login!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
