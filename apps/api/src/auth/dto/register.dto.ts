import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

function SameAs(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'sameAs',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const other = (args.object as Record<string, unknown>)[
            args.constraints[0] as string
          ];
          return value === other;
        },
      },
    });
  };
}

/** Cadastro público: sempre vira ALUNO, sem instituição. */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(trim)
  name!: string;

  @IsEmail()
  @MaxLength(180)
  @Transform(lower)
  email!: string;

  @IsEmail()
  @MaxLength(180)
  @Transform(lower)
  @SameAs('email', { message: 'Os e-mails não coincidem' })
  emailConfirm!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}
