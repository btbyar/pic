import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/** `@Body(new ZodPipe(schema))` — буруу оролтыг 400 + талбар тус бүрийн алдаагаар буцаана. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'validation_failed',
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}
