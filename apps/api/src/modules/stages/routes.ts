import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { type BookStatus } from '@paper-book-traces/shared';
import { prisma } from '../../lib/prisma.js';
import { AppError, zodFields } from '../../lib/errors.js';
import { currentUser, requireAuth } from '../../lib/auth.js';
import { isRestoreWindowOpen, normalizeText } from '../../lib/domain.js';
import { writeEvent } from '../../lib/events.js';
import { parseId } from '../../lib/http.js';

const updateSchema = z
  .object({
    note: z.string().trim().max(2000).optional(),
    pauseReason: z.preprocess(
      (value) => (value === '' ? null : value),
      z.string().trim().max(1000).nullable().optional()
    ),
    version: z.number().int().positive().optional()
  })
  .refine((value) => value.note !== undefined || value.pauseReason !== undefined, {
    message: '至少提供一个要更新的字段'
  });

const deleteSchema = z.object({ version: z.number().int().positive().optional() }).optional();

function serialize(item: {
  id: string;
  bookId: string;
  version: number;
  readingRound: number;
  stage: BookStatus;
  note: string;
  pauseReason: string | null;
  enteredAt: Date;
  leftAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    bookId: item.bookId,
    version: item.version,
    readingRound: item.readingRound,
    stage: item.stage,
    note: item.note,
    pauseReason: item.pauseReason,
    enteredAt: item.enteredAt,
    leftAt: item.leftAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function assertVersion(current: number, requested?: number): void {
  if (requested && requested !== current) {
    throw new AppError(409, 'STALE_WRITE', '阶段备注已在其他位置被修改，请刷新后重试');
  }
}

function eventSummary(value: string | null | undefined): string {
  return value ? normalizeText(value).slice(0, 120) : '';
}

export const stageRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  app.get('/books/:bookId/stages', async (request) => {
    const bookId = parseId((request.params as { bookId: string }).bookId, 'bookId');
    const userId = currentUser(request).id;
    const book = await prisma.book.findFirst({ where: { id: bookId, userId, deletedAt: null } });
    if (!book) throw new AppError(404, 'NOT_FOUND', '书目不存在');
    const notes = await prisma.stageNote.findMany({
      where: { bookId, userId, deletedAt: null },
      orderBy: [{ enteredAt: 'desc' }, { readingRound: 'desc' }]
    });
    return { items: notes.map(serialize) };
  });

  app.patch('/stage-notes/:stageNoteId', async (request) => {
    const id = parseId((request.params as { stageNoteId: string }).stageNoteId, 'stageNoteId');
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', '阶段备注无效', zodFields(parsed.error));
    const userId = currentUser(request).id;
    const existing = await prisma.stageNote.findFirst({
      where: { id, userId, deletedAt: null },
      include: { book: true }
    });
    if (!existing || existing.book.deletedAt) throw new AppError(404, 'NOT_FOUND', '阶段备注不存在');
    assertVersion(existing.version, parsed.data.version);
    if (parsed.data.pauseReason !== undefined && existing.stage !== 'PAUSED') {
      throw new AppError(422, 'PAUSE_REASON_NOT_ALLOWED', '只有暂时搁置阶段可以记录暂停原因', {
        pauseReason: '只有暂时搁置阶段可以记录暂停原因'
      });
    }
    const note = parsed.data.note === undefined ? existing.note : normalizeText(parsed.data.note);
    const pauseReason =
      parsed.data.pauseReason === undefined
        ? existing.pauseReason
        : parsed.data.pauseReason
          ? normalizeText(parsed.data.pauseReason)
          : null;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM books WHERE id = ${existing.bookId}::uuid FOR UPDATE`;
      const result = await tx.stageNote.updateMany({
        where: { id, userId, deletedAt: null, version: existing.version },
        data: { note, pauseReason, version: { increment: 1 } }
      });
      if (result.count !== 1) throw new AppError(409, 'STALE_WRITE', '阶段备注已在其他位置被修改');
      if (
        parsed.data.pauseReason !== undefined &&
        existing.stage === 'PAUSED' &&
        existing.leftAt === null
      ) {
        const currentBook = await tx.book.findFirstOrThrow({ where: { id: existing.bookId } });
        if (currentBook.status === 'PAUSED') {
          const bookResult = await tx.book.updateMany({
            where: { id: existing.bookId, version: currentBook.version },
            data: { pauseReason, version: { increment: 1 } }
          });
          if (bookResult.count !== 1) {
            throw new AppError(409, 'STALE_WRITE', '书目已在其他位置被修改，请刷新后重试');
          }
        }
      }
      await writeEvent(tx, {
        userId,
        bookId: existing.bookId,
        entityType: 'STAGE_NOTE',
        entityId: id,
        action: 'UPDATED',
        payload: {
          readingRound: existing.readingRound,
          stage: existing.stage,
          pauseReason: eventSummary(pauseReason),
          summary: eventSummary(note)
        }
      });
      return tx.stageNote.findUniqueOrThrow({ where: { id } });
    });
    return { stageNote: serialize(updated) };
  });

  app.delete('/stage-notes/:stageNoteId', async (request, reply) => {
    const id = parseId((request.params as { stageNoteId: string }).stageNoteId, 'stageNoteId');
    const parsed = deleteSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', '删除参数无效', zodFields(parsed.error));
    const userId = currentUser(request).id;
    const existing = await prisma.stageNote.findFirst({
      where: { id, userId, deletedAt: null },
      include: { book: true }
    });
    if (!existing || existing.book.deletedAt) throw new AppError(404, 'NOT_FOUND', '阶段备注不存在');
    assertVersion(existing.version, parsed.data?.version);

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM books WHERE id = ${existing.bookId}::uuid FOR UPDATE`;
      const result = await tx.stageNote.updateMany({
        where: { id, userId, deletedAt: null, version: existing.version },
        data: { deletedAt: new Date(), version: { increment: 1 } }
      });
      if (result.count !== 1) throw new AppError(409, 'STALE_WRITE', '阶段备注已在其他位置被修改');
      if (existing.stage === 'PAUSED' && existing.leftAt === null) {
        const currentBook = await tx.book.findFirstOrThrow({ where: { id: existing.bookId } });
        if (currentBook.status === 'PAUSED' && currentBook.pauseReason === existing.pauseReason) {
          await tx.book.update({
            where: { id: existing.bookId },
            data: { pauseReason: null, version: { increment: 1 } }
          });
        }
      }
      await writeEvent(tx, {
        userId,
        bookId: existing.bookId,
        entityType: 'STAGE_NOTE',
        entityId: id,
        action: 'DELETED',
        payload: { readingRound: existing.readingRound, stage: existing.stage }
      });
    });
    return reply.status(204).send();
  });

  app.post('/stage-notes/:stageNoteId/restore', async (request) => {
    const id = parseId((request.params as { stageNoteId: string }).stageNoteId, 'stageNoteId');
    const userId = currentUser(request).id;
    const existing = await prisma.stageNote.findFirst({
      where: { id, userId },
      include: { book: true }
    });
    if (!existing || !existing.deletedAt) throw new AppError(404, 'NOT_FOUND', '已删除阶段备注不存在');
    if (!isRestoreWindowOpen(existing.deletedAt)) {
      throw new AppError(409, 'RESTORE_WINDOW_EXPIRED', '已超过 24 小时恢复窗口');
    }
    if (existing.book.deletedAt) throw new AppError(409, 'BOOK_DELETED', '所属书目已删除');
    const duplicate = await prisma.stageNote.findFirst({
      where: {
        bookId: existing.bookId,
        readingRound: existing.readingRound,
        stage: existing.stage,
        deletedAt: null,
        id: { not: id }
      }
    });
    if (duplicate) throw new AppError(409, 'STAGE_NOTE_EXISTS', '该阶段已有备注，无法恢复');

    const restored = await prisma.$transaction(async (tx) => {
      const value = await tx.stageNote.update({
        where: { id },
        data: { deletedAt: null, version: { increment: 1 } }
      });
      await writeEvent(tx, {
        userId,
        bookId: value.bookId,
        entityType: 'STAGE_NOTE',
        entityId: id,
        action: 'RESTORED',
        payload: { readingRound: value.readingRound, stage: value.stage }
      });
      return value;
    });
    return { stageNote: serialize(restored) };
  });
};
