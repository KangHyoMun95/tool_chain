// src/common/all-exceptions.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";

// Không bao giờ trả stack trace hoặc lỗi DB ra ngoài; chi tiết chỉ nằm trong log của server.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      res.status(exception.getStatus()).json(typeof body === "string" ? { statusCode: exception.getStatus(), message: body } : body);
      return;
    }

    // Lỗi 4xx từ middleware (vd body-parser: payload quá lớn, JSON hỏng).
    const status = (exception as { status?: unknown } | null)?.status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      res.status(status).json({ statusCode: status, message: HttpStatus[status] ?? "Bad Request" });
      return;
    }

    this.log.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message: "Internal server error" });
  }
}
