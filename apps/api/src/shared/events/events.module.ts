import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";

/**
 * In-process domain event bus (docs/architecture/overview.md "Domain events").
 * No events are published yet — modules start emitting/consuming them
 * (employee.created, leave.approved, etc.) as they're built. EventEmitterModule
 * .forRoot() is global on its own; this wrapper just gives it a home matching
 * our other shared/ modules.
 */
@Module({
  imports: [EventEmitterModule.forRoot()],
})
export class EventsModule {}
