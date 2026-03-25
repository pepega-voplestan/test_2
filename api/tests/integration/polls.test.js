import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { request, authenticatedAgent, cleanDb, disconnectDb, getTestPrisma } from "../helpers.js";
import { createUser, createShout, createPoll, createPollVote } from "../fixtures/index.js";

describe("Polls routes", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  // ── POST /api/v1/shouts (with poll) ──────────────────────────────────────

  describe("POST /api/v1/shouts with poll", () => {
    it("creates a shout with a poll", async () => {
      const user = await createUser({ username: "author", email: "author@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent
        .post("/api/v1/shouts")
        .send({
          content: "Poll test",
          poll: { multi: false, options: ["Option A", "Option B", "Option C"] },
        });

      expect(res.status).toBe(200);
      expect(res.body.shout.poll).toBeDefined();
      expect(res.body.shout.poll.multi).toBe(false);
      expect(res.body.shout.poll.options).toHaveLength(3);
      expect(res.body.shout.poll.options[0].text).toBe("Option A");
      expect(res.body.shout.poll.options[0].votes).toBe(0);
      expect(res.body.shout.poll.userVotes).toEqual([]);
    });

    it("creates a shout without a poll", async () => {
      const user = await createUser({ username: "author", email: "author@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent
        .post("/api/v1/shouts")
        .send({ content: "No poll" });

      expect(res.status).toBe(200);
      expect(res.body.shout.poll).toBeUndefined();
    });

    it("rejects poll with more than 7 options", async () => {
      const user = await createUser({ username: "author", email: "author@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent
        .post("/api/v1/shouts")
        .send({
          content: "Too many options",
          poll: { multi: false, options: ["1", "2", "3", "4", "5", "6", "7", "8"] },
        });

      expect(res.status).toBe(400);
    });

    it("rejects poll with fewer than 2 options", async () => {
      const user = await createUser({ username: "author", email: "author@test.local" });
      const agent = await authenticatedAgent(user);

      const res1 = await agent
        .post("/api/v1/shouts")
        .send({
          content: "Too few options",
          poll: { multi: false, options: ["Only one"] },
        });
      expect(res1.status).toBe(400);

      const res2 = await agent
        .post("/api/v1/shouts")
        .send({
          content: "Empty poll",
          poll: { multi: false, options: [] },
        });
      expect(res2.status).toBe(400);
    });

    it("rejects poll option exceeding 144 chars", async () => {
      const user = await createUser({ username: "author", email: "author@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent
        .post("/api/v1/shouts")
        .send({
          content: "Long option",
          poll: { multi: false, options: ["a".repeat(145), "valid"] },
        });

      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/v1/polls/:pollId/vote ──────────────────────────────────────

  describe("POST /api/v1/polls/:pollId/vote", () => {
    it("returns 401 when not authenticated", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const poll = await createPoll({ shoutId: shout.id });

      const res = await (await request()).post(`/api/v1/polls/${poll.id}/vote`).send({ optionIds: [poll.options[0].id] });
      expect(res.status).toBe(401);
    });

    it("returns 404 for non-existent poll", async () => {
      const user = await createUser({ username: "voter", email: "voter@test.local" });
      const agent = await authenticatedAgent(user);

      const res = await agent.post("/api/v1/polls/nonexistent/vote").send({ optionIds: ["fake"] });
      expect(res.status).toBe(404);
    });

    it("single-select: votes on an option", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const poll = await createPoll({ shoutId: shout.id, multi: 0 });

      const voter = await createUser({ username: "voter", email: "voter@test.local" });
      const agent = await authenticatedAgent(voter);

      const res = await agent
        .post(`/api/v1/polls/${poll.id}/vote`)
        .send({ optionIds: [poll.options[0].id] });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.userVotes).toEqual([poll.options[0].id]);
      const optA = res.body.options.find(o => o.id === poll.options[0].id);
      expect(optA.votes).toBe(1);
    });

    it("rejects re-voting on the same poll", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const poll = await createPoll({ shoutId: shout.id, multi: 0 });

      const voter = await createUser({ username: "voter", email: "voter@test.local" });
      const agent = await authenticatedAgent(voter);

      // Vote once
      await agent.post(`/api/v1/polls/${poll.id}/vote`).send({ optionIds: [poll.options[0].id] });
      // Try to vote again
      const res = await agent.post(`/api/v1/polls/${poll.id}/vote`).send({ optionIds: [poll.options[1].id] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("уже проголосовали");
    });

    it("single-select: rejects multiple optionIds", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const poll = await createPoll({ shoutId: shout.id, multi: 0 });

      const voter = await createUser({ username: "voter", email: "voter@test.local" });
      const agent = await authenticatedAgent(voter);

      const res = await agent
        .post(`/api/v1/polls/${poll.id}/vote`)
        .send({ optionIds: [poll.options[0].id, poll.options[1].id] });

      expect(res.status).toBe(400);
    });

    it("multi-select: votes on multiple options at once", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const poll = await createPoll({ shoutId: shout.id, multi: 1, options: ["A", "B", "C"] });

      const voter = await createUser({ username: "voter", email: "voter@test.local" });
      const agent = await authenticatedAgent(voter);

      const res = await agent
        .post(`/api/v1/polls/${poll.id}/vote`)
        .send({ optionIds: [poll.options[0].id, poll.options[1].id] });

      expect(res.status).toBe(200);
      expect(res.body.userVotes).toHaveLength(2);
      expect(res.body.userVotes).toContain(poll.options[0].id);
      expect(res.body.userVotes).toContain(poll.options[1].id);
      const optA = res.body.options.find(o => o.id === poll.options[0].id);
      const optB = res.body.options.find(o => o.id === poll.options[1].id);
      expect(optA.votes).toBe(1);
      expect(optB.votes).toBe(1);
    });

    it("multi-select: rejects re-voting after initial submission", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const poll = await createPoll({ shoutId: shout.id, multi: 1, options: ["A", "B", "C"] });

      const voter = await createUser({ username: "voter", email: "voter@test.local" });
      const agent = await authenticatedAgent(voter);

      // Vote on A and B
      await agent
        .post(`/api/v1/polls/${poll.id}/vote`)
        .send({ optionIds: [poll.options[0].id, poll.options[1].id] });

      // Try to add C — should be rejected
      const res = await agent
        .post(`/api/v1/polls/${poll.id}/vote`)
        .send({ optionIds: [poll.options[2].id] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("уже проголосовали");
    });

    it("rejects vote with invalid option id", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const poll = await createPoll({ shoutId: shout.id });

      const voter = await createUser({ username: "voter", email: "voter@test.local" });
      const agent = await authenticatedAgent(voter);

      const res = await agent
        .post(`/api/v1/polls/${poll.id}/vote`)
        .send({ optionIds: ["nonexistent-id"] });

      expect(res.status).toBe(400);
    });

    it("returns 403 when user is banned", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const poll = await createPoll({ shoutId: shout.id });

      const voter = await createUser({ username: "voter", email: "voter@test.local" });
      const agent = await authenticatedAgent(voter);
      await getTestPrisma().user.update({ where: { id: voter.id }, data: { is_banned: 1 } });

      const res = await agent
        .post(`/api/v1/polls/${poll.id}/vote`)
        .send({ optionIds: [poll.options[0].id] });

      expect(res.status).toBe(403);
    });
  });

  // ── Feed enrichment with polls ────────────────────────────────────────────

  describe("GET /api/v1/shouts (feed with polls)", () => {
    it("includes poll data in feed response", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      await createPoll({ shoutId: shout.id, options: ["Yes", "No"] });

      const res = await (await request()).get("/api/v1/shouts");
      expect(res.status).toBe(200);

      const feedShout = res.body.shouts.find(s => s.id === shout.id);
      expect(feedShout.poll).toBeDefined();
      expect(feedShout.poll.options).toHaveLength(2);
      expect(feedShout.poll.userVotes).toEqual([]);
    });

    it("includes userVotes for authenticated user", async () => {
      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const poll = await createPoll({ shoutId: shout.id, options: ["Yes", "No"] });

      const voter = await createUser({ username: "voter", email: "voter@test.local" });
      await createPollVote({ optionId: poll.options[0].id, userId: voter.id });

      const agent = await authenticatedAgent(voter);
      const res = await agent.get("/api/v1/shouts");
      expect(res.status).toBe(200);

      const feedShout = res.body.shouts.find(s => s.id === shout.id);
      expect(feedShout.poll.userVotes).toContain(poll.options[0].id);
    });
  });

  // ── SSE emission ──────────────────────────────────────────────────────────

  describe("SSE emission", () => {
    it("broadcasts poll_update on vote", async () => {
      const { broadcast } = await import("../../src/sse.js");

      const author = await createUser({ username: "author", email: "author@test.local" });
      const shout = await createShout({ userId: author.id });
      const poll = await createPoll({ shoutId: shout.id });

      const voter = await createUser({ username: "voter", email: "voter@test.local" });
      const agent = await authenticatedAgent(voter);

      await agent
        .post(`/api/v1/polls/${poll.id}/vote`)
        .send({ optionIds: [poll.options[0].id] });

      expect(broadcast).toHaveBeenCalledWith("poll_update", expect.objectContaining({
        pollId: poll.id,
        options: expect.any(Array),
      }));
    });
  });
});
