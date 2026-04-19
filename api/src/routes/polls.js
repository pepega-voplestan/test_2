import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { broadcast } from "../sse.js";
import { asyncHandler } from "../helpers/common.js";

const router = Router();

/* vote on a poll */
router.post("/polls/:pollId/vote", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.session.user.id;
  const banCheck = await prisma.user.findUnique({ where: { id: userId }, select: { is_banned: true } });
  if (banCheck?.is_banned) return res.status(403).json({ error: "Вы забанены!" });

  const { pollId } = req.params;
  const { optionIds } = req.body;

  if (!Array.isArray(optionIds) || optionIds.length === 0) {
    return res.status(400).json({ error: "Нужно выбрать хотя бы один вариант" });
  }

  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: { options: true, shout: { select: { is_deleted: true } } },
  });

  if (!poll) return res.status(404).json({ error: "Опрос не найден" });
  if (poll.shout.is_deleted) return res.status(404).json({ error: "Запись удалена" });

  // Check if user already voted — no re-voting allowed
  const existingVotes = await prisma.pollVote.findMany({
    where: { user_id: userId, option: { poll_id: pollId } },
  });
  if (existingVotes.length > 0) {
    return res.status(400).json({ error: "Вы уже проголосовали в этом опросе" });
  }

  // Validate optionIds belong to this poll
  const pollOptionIds = new Set(poll.options.map(o => o.id));
  for (const oid of optionIds) {
    if (!pollOptionIds.has(oid)) {
      return res.status(400).json({ error: "Неверный вариант ответа" });
    }
  }

  // Single-select: only 1 option allowed
  if (!poll.multi && optionIds.length > 1) {
    return res.status(400).json({ error: "В этом опросе можно выбрать только один вариант" });
  }

  // Create votes
  for (const optionId of optionIds) {
    await prisma.pollVote.create({
      data: { option_id: optionId, user_id: userId },
    });
    await prisma.pollOption.update({
      where: { id: optionId },
      data: { votes: { increment: 1 } },
    });
  }

  // Fetch updated options in original display order
  const updatedOptions = await prisma.pollOption.findMany({
    where: { poll_id: pollId },
    orderBy: { position: "asc" },
  });

  // Fetch current user's votes
  const userVotes = await prisma.pollVote.findMany({
    where: { user_id: userId, option: { poll_id: pollId } },
    select: { option_id: true },
  });

  const optionsPayload = updatedOptions.map(o => ({ id: o.id, votes: o.votes }));

  // Count unique voters
  const allVotes = await prisma.pollVote.findMany({
    where: { option: { poll_id: pollId } },
    select: { user_id: true },
  });
  const totalVoters = new Set(allVotes.map(v => v.user_id)).size;

  console.log(`[Polls] Vote on poll ${pollId} by ${userId}`);
  broadcast("poll_update", { pollId, options: optionsPayload, totalVoters });

  res.json({
    ok: true,
    options: optionsPayload,
    userVotes: userVotes.map(v => v.option_id),
  });
}));

export default router;
