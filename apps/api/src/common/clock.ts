import { Injectable } from '@nestjs/common';

/** Injectable time source, so expiry and rotation logic can be tested without waiting. */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
