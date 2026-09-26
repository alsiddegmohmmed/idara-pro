import { Injectable } from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EventsModule } from "../src/shared/events/events.module";

interface EmployeeCreatedEvent {
  employeeId: string;
}

@Injectable()
class TestListener {
  received: EmployeeCreatedEvent[] = [];

  @OnEvent("employee.created")
  handle(event: EmployeeCreatedEvent): void {
    this.received.push(event);
  }
}

describe("EventsModule", () => {
  it("delivers a published event to a listener", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventsModule],
      providers: [TestListener],
    }).compile();

    const app = await moduleRef.init();

    const emitter = app.get(EventEmitter2);
    const listener = app.get(TestListener);

    emitter.emit("employee.created", { employeeId: "emp-1" });

    expect(listener.received).toEqual([{ employeeId: "emp-1" }]);

    await app.close();
  });
});
