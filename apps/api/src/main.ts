import "reflect-metadata";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./shared/errors/http-exception.filter";
import { ConfigService } from "./shared/config/config.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  await app.register(helmet);
  await app.register(cors, { origin: config.env.CORS_ORIGIN, credentials: true });

  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(config.env.PORT, "0.0.0.0");
}

bootstrap();
