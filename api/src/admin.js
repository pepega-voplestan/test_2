import { dirname, join } from "path";
import { fileURLToPath } from "url";
import AdminJS, { ComponentLoader } from "adminjs";
import AdminJSExpress from "@adminjs/express";
import { Database, Resource, getModelByName } from "@adminjs/prisma";
import { prisma } from "./db.js";
import { verifyPassword } from "./auth.js";

AdminJS.registerAdapter({ Database, Resource });

const __dirname = dirname(fileURLToPath(import.meta.url));
const componentLoader = new ComponentLoader();
const Components = {
  Dashboard: componentLoader.add("Dashboard", join(__dirname, "admin-dashboard")),
};

export async function setupAdmin() {
  // ── Validate required env vars ──
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
  const ADMIN_COOKIE_SECRET = process.env.ADMIN_COOKIE_SECRET;

  if (!ADMIN_EMAIL) throw new Error("ADMIN_EMAIL env var is required");
  if (!ADMIN_PASSWORD_HASH) throw new Error("ADMIN_PASSWORD_HASH env var is required");
  if (!ADMIN_COOKIE_SECRET) throw new Error("ADMIN_COOKIE_SECRET env var is required");
  if (ADMIN_COOKIE_SECRET.length < 32) throw new Error("ADMIN_COOKIE_SECRET must be at least 32 characters");

  const admin = new AdminJS({
    rootPath: "/admin",
    loginPath: "/admin/login",
    logoutPath: "/admin/logout",
    resources: [
      // ── Users: view, ban/unban via edit ──
      {
        resource: { model: getModelByName("User"), client: prisma },
        options: {
          navigation: { name: "Пользователи", icon: "User" },
          sort: { sortBy: "created_at", direction: "desc" },
          properties: {
            password_hash: { isVisible: false },
            id: { isDisabled: true },
            created_at: { isDisabled: true },
          },
          actions: {
            new: { isAccessible: false },
            delete: { isAccessible: false },
            bulkDelete: { isAccessible: false },
            // ── Related record actions: redirect to filtered list views ──
            viewShouts: {
              actionType: "record",
              label: "Вопли →",
              icon: "Document",
              component: false,
              handler: async (request, response, context) => {
                const userId = context.record.params.id;
                return {
                  record: context.record.toJSON(context.currentAdmin),
                  redirectUrl: `/admin/resources/Shout?filters.user=${userId}`,
                };
              },
            },
            viewComments: {
              actionType: "record",
              label: "Комменты →",
              icon: "MessageCircle",
              component: false,
              handler: async (request, response, context) => {
                const userId = context.record.params.id;
                return {
                  record: context.record.toJSON(context.currentAdmin),
                  redirectUrl: `/admin/resources/Comment?filters.user=${userId}`,
                };
              },
            },
            viewMedia: {
              actionType: "record",
              label: "Медиа →",
              icon: "Image",
              component: false,
              handler: async (request, response, context) => {
                const userId = context.record.params.id;
                return {
                  record: context.record.toJSON(context.currentAdmin),
                  redirectUrl: `/admin/resources/Media?filters.user=${userId}`,
                };
              },
            },
            edit: {
              before: async (request, context) => {
                // On save, snapshot the current is_banned before the update
                if (request.method === "post") {
                  const userId = context.record?.params?.id;
                  if (userId) {
                    const user = await prisma.user.findUnique({
                      where: { id: userId },
                      select: { is_banned: true },
                    });
                    request.params._prevIsBanned = user?.is_banned ?? 0;
                  }
                }
                return request;
              },
              after: async (response, request, _context) => {
                if (request.method !== "post") return response;

                const record = response.record;
                if (!record || !record.params) return response;

                const userId = record.params.id;
                const isBanned = Number(record.params.is_banned);
                const prev = Number(request.params._prevIsBanned ?? 0);

                if (prev !== isBanned) {
                  if (isBanned === 1 && prev === 0) {
                    // BANNED: soft-delete all user's active content with marker 2
                    const { count: shouts } = await prisma.shout.updateMany({
                      where: { user_id: userId, is_deleted: 0 },
                      data: { is_deleted: 2 },
                    });
                    const { count: comments } = await prisma.comment.updateMany({
                      where: { user_id: userId, is_deleted: 0 },
                      data: { is_deleted: 2 },
                    });
                    console.log(`[Admin] Banned user ${userId}: hid ${shouts} shouts, ${comments} comments`);
                  } else if (isBanned === 0 && prev === 1) {
                    // UNBANNED: restore only ban-deleted content (is_deleted = 2)
                    const { count: shouts } = await prisma.shout.updateMany({
                      where: { user_id: userId, is_deleted: 2 },
                      data: { is_deleted: 0 },
                    });
                    const { count: comments } = await prisma.comment.updateMany({
                      where: { user_id: userId, is_deleted: 2 },
                      data: { is_deleted: 0 },
                    });
                    console.log(`[Admin] Unbanned user ${userId}: restored ${shouts} shouts, ${comments} comments`);
                  }
                }
                return response;
              },
            },
          },
        },
      },

      // ── Shouts: soft-delete (default), restore ──
      {
        resource: { model: getModelByName("Shout"), client: prisma },
        options: {
          navigation: { name: "Контент", icon: "Document" },
          sort: { sortBy: "created_at", direction: "desc" },
          properties: {
            content: { type: "textarea" },
            id: { isDisabled: true },
            created_at: { isDisabled: true },
            is_pinned: {
              type: "number",
              description: "1 = закреплённый вопль (отображается первым в ленте)",
            },
            // Hide legacy inline media columns
            media_type: { isVisible: false },
            media_url: { isVisible: false },
            media_meta: { isVisible: false },
          },
          actions: {
            bulkDelete: { isAccessible: false },
            // Default delete → soft-delete
            delete: {
              handler: async (request, response, context) => {
                const { record, resource, h } = context;
                await prisma.shout.update({
                  where: { id: record.params.id },
                  data: { is_deleted: 1 },
                });
                await prisma.comment.updateMany({
                  where: { shout_id: record.params.id },
                  data: { is_deleted: 1 },
                });
                return {
                  record: record.toJSON(context.currentAdmin),
                  redirectUrl: h.resourceUrl({
                    resourceId:
                      resource._decorated?.id() || resource.id(),
                  }),
                  notice: {
                    message: "Вопль скрыт (soft-delete)",
                    type: "success",
                  },
                };
              },
            },
            // Restore soft-deleted shout
            restore: {
              actionType: "record",
              label: "Восстановить",
              component: false,
              guard: "Восстановить этот вопль?",
              handler: async (request, response, context) => {
                const { record, resource, h } = context;
                await prisma.shout.update({
                  where: { id: record.params.id },
                  data: { is_deleted: 0 },
                });
                return {
                  record: record.toJSON(context.currentAdmin),
                  redirectUrl: h.resourceUrl({
                    resourceId:
                      resource._decorated?.id() || resource.id(),
                  }),
                  notice: {
                    message: "Вопль восстановлен",
                    type: "success",
                  },
                };
              },
            },
          },
        },
      },

      // ── Comments: soft-delete (default), restore ──
      {
        resource: { model: getModelByName("Comment"), client: prisma },
        options: {
          navigation: { name: "Контент", icon: "Document" },
          sort: { sortBy: "created_at", direction: "desc" },
          properties: {
            content: { type: "textarea" },
            id: { isDisabled: true },
            created_at: { isDisabled: true },
          },
          actions: {
            bulkDelete: { isAccessible: false },
            delete: {
              handler: async (request, response, context) => {
                const { record, resource, h } = context;
                await prisma.comment.update({
                  where: { id: record.params.id },
                  data: { is_deleted: 1 },
                });
                return {
                  record: record.toJSON(context.currentAdmin),
                  redirectUrl: h.resourceUrl({
                    resourceId:
                      resource._decorated?.id() || resource.id(),
                  }),
                  notice: {
                    message: "Комментарий скрыт (soft-delete)",
                    type: "success",
                  },
                };
              },
            },
            restore: {
              actionType: "record",
              label: "Восстановить",
              component: false,
              guard: "Восстановить этот комментарий?",
              handler: async (request, response, context) => {
                const { record, resource, h } = context;
                await prisma.comment.update({
                  where: { id: record.params.id },
                  data: { is_deleted: 0 },
                });
                return {
                  record: record.toJSON(context.currentAdmin),
                  redirectUrl: h.resourceUrl({
                    resourceId:
                      resource._decorated?.id() || resource.id(),
                  }),
                  notice: {
                    message: "Комментарий восстановлен",
                    type: "success",
                  },
                };
              },
            },
          },
        },
      },

      // ── Media: read-only, resolves media_id references from Shouts/Comments ──
      {
        resource: { model: getModelByName("Media"), client: prisma },
        options: {
          navigation: { name: "Контент", icon: "Document" },
          sort: { sortBy: "created_at", direction: "desc" },
          properties: {
            id: { isDisabled: true },
            created_at: { isDisabled: true },
          },
          actions: {
            delete: { isAccessible: false },
            bulkDelete: { isAccessible: false },
          },
        },
      },

      // ── Announcements: new → auto-soft-deletes previous ──
      {
        resource: { model: getModelByName("Announcement"), client: prisma },
        options: {
          navigation: { name: "Контент", icon: "Document" },
          sort: { sortBy: "created_at", direction: "desc" },
          properties: {
            content: { type: "textarea" },
            id: { isDisabled: true },
            created_at: { isDisabled: true },
          },
          actions: {
            bulkDelete: { isAccessible: false },
            delete: {
              handler: async (request, response, context) => {
                const { record, resource, h } = context;
                await prisma.announcement.update({
                  where: { id: record.params.id },
                  data: { is_deleted: 1 },
                });
                return {
                  record: record.toJSON(context.currentAdmin),
                  redirectUrl: h.resourceUrl({
                    resourceId: resource._decorated?.id() || resource.id(),
                  }),
                  notice: {
                    message: "Объявление скрыто (soft-delete)",
                    type: "success",
                  },
                };
              },
            },
            new: {
              before: async (request) => {
                // On POST (actual creation), soft-delete all active announcements first
                if (request.method === "post") {
                  await prisma.announcement.updateMany({
                    where: { is_deleted: 0 },
                    data: { is_deleted: 1 },
                  });
                }
                return request;
              },
            },
          },
        },
      },

      // ── Settings: edit value only, key is read-only ──
      {
        resource: { model: getModelByName("Setting"), client: prisma },
        options: {
          navigation: { name: "Настройки", icon: "Settings" },
          properties: {
            key: { isDisabled: true },
          },
          actions: {
            new: { isAccessible: false },
            delete: { isAccessible: false },
            bulkDelete: { isAccessible: false },
          },
        },
      },

    ],
    componentLoader,
    dashboard: {
      component: Components.Dashboard,
      handler: async (request) => {
        const days = parseInt(request.query?.days, 10) || 30;
        const since = days > 0
          ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
          : null;

        const dateFilter = since ? { created_at: { gte: since } } : {};

        const [users, shouts, comments, shoutLikes, commentLikes, media] = await Promise.all([
          prisma.user.count({ where: dateFilter }),
          prisma.shout.count({ where: { is_deleted: 0, ...dateFilter } }),
          prisma.comment.count({ where: { is_deleted: 0, ...dateFilter } }),
          prisma.shoutLike.count({ where: dateFilter }),
          prisma.commentLike.count({ where: dateFilter }),
          prisma.media.count({ where: dateFilter }),
        ]);

        // Timeline: group by date (last N days, or last 30 if "all time")
        const timelineDays = days > 0 ? Math.min(days, 90) : 30;
        const timelineSince = new Date(Date.now() - timelineDays * 24 * 60 * 60 * 1000).toISOString();

        const [shoutsTimeline, commentsTimeline, shoutLikesTimeline, commentLikesTimeline, usersTimeline] = await Promise.all([
          prisma.$queryRawUnsafe(
            `SELECT date(created_at) as date, COUNT(*) as count FROM shouts WHERE is_deleted = 0 AND created_at >= ? GROUP BY date(created_at) ORDER BY date`,
            timelineSince,
          ),
          prisma.$queryRawUnsafe(
            `SELECT date(created_at) as date, COUNT(*) as count FROM comments WHERE is_deleted = 0 AND created_at >= ? GROUP BY date(created_at) ORDER BY date`,
            timelineSince,
          ),
          prisma.$queryRawUnsafe(
            `SELECT date(created_at) as date, COUNT(*) as count FROM shout_likes WHERE created_at >= ? GROUP BY date(created_at) ORDER BY date`,
            timelineSince,
          ),
          prisma.$queryRawUnsafe(
            `SELECT date(created_at) as date, COUNT(*) as count FROM comment_likes WHERE created_at >= ? GROUP BY date(created_at) ORDER BY date`,
            timelineSince,
          ),
          prisma.$queryRawUnsafe(
            `SELECT date(created_at) as date, COUNT(*) as count FROM users WHERE created_at >= ? GROUP BY date(created_at) ORDER BY date`,
            timelineSince,
          ),
        ]);

        const toTimeline = (rows) => rows.map((r) => ({ date: r.date, count: Number(r.count) }));
        const mergeLikes = (sl, cl) => {
          const map = new Map();
          for (const r of sl) map.set(r.date, (map.get(r.date) || 0) + Number(r.count));
          for (const r of cl) map.set(r.date, (map.get(r.date) || 0) + Number(r.count));
          return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count }));
        };

        return {
          totals: { users, shouts, comments, shoutLikes, commentLikes, media },
          timeline: {
            shouts: toTimeline(shoutsTimeline),
            comments: toTimeline(commentsTimeline),
            likes: mergeLikes(shoutLikesTimeline, commentLikesTimeline),
            users: toTimeline(usersTimeline),
          },
        };
      },
    },
    branding: {
      companyName: "Вопли — Админ-панель",
      softwareBrothers: false,
    },
  });

  const adminRouter = AdminJSExpress.buildAuthenticatedRouter(
    admin,
    {
      authenticate: async (email, password) => {
        if (email !== ADMIN_EMAIL) return null;
        const valid = await verifyPassword(password, ADMIN_PASSWORD_HASH);
        if (!valid) return null;
        console.log(`[Admin] Login: ${email}`);
        return { email };
      },
      cookieName: "adminjs",
      cookiePassword: ADMIN_COOKIE_SECRET,
    },
    null,
    {
      resave: false,
      saveUninitialized: false,
      secret: ADMIN_COOKIE_SECRET,
    }
  );

  return { admin, adminRouter };
}
