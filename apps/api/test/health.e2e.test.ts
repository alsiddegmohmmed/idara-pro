import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("health", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.CORS_ORIGIN ??= "http://localhost:5173";
    process.env.DATABASE_URL ??= "postgresql://idara:idara@localhost:5432/idara_test";
    process.env.JWT_ACCESS_SECRET ??= "test-access-secret-needs-32-characters!!";
    process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-needs-32-characters!";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns ok", async () => {
    const res = await request(app.getHttpServer()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /ready returns ok", async () => {
    const res = await request(app.getHttpServer()).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
